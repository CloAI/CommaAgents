import { afterEach, describe, expect } from "bun:test";
import { test, spyOn } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpConnectionManager } from "@comma-agents/core/mcp";
import { McpConfigFileSchema } from "@comma-agents/core/mcp";
import type { McpServersUpdated } from "./mcp.notifications";
import { createMcpFixture, cleanupMcpFixtures, strategy } from "./test.utils";
import { createRunsPlugin } from "../runs";
import { createMcpPlugin } from "./mcp";

afterEach(cleanupMcpFixtures);

describe("MCP plugin", () => {
  test("should discover layered configuration, connect only assigned enabled servers, and inject namespaced tools", async () => {
    const fixture = await createMcpFixture();
    const {
      runs,
      mcp,
      cwd,
      strategyPath,
      runRepository,
      configurations,
      toolsByRun,
      managers,
    } = fixture;
    await runs.prepareRun({ runId: "root", strategyPath, cwd });
    expect([...configurations[0]!.servers.keys()].sort()).toEqual([
      "disabled",
      "private",
      "shared",
    ]);
    expect(configurations[0]!.enabledServerIds).toEqual(["shared", "private"]);
    expect(await runRepository.getRunConfig("root")).toEqual({
      enabledMcpServerIds: ["shared", "private"],
    });
    expect(Object.values(toolsByRun.get("root")!.writer!.origins)).toEqual([
      { serverId: "shared", toolName: "inspect" },
      { serverId: "private", toolName: "inspect" },
    ]);
    const servers = await mcp.listServers({ runId: "root" });
    expect(servers.find((server) => server.id === "private")).toMatchObject({
      source: "strategy",
      connected: true,
      toolCount: 1,
      assignedAgents: ["writer"],
    });
    expect(servers.find((server) => server.id === "unassigned")).toMatchObject({
      toolCount: 0,
      assignedAgents: [],
      enabled: false,
    });
    await runs.startRun("root", "done").completion;
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
    expect(
      (await mcp.listServers({ runId: "root" })).every(
        (server) => server.connected !== true,
      ),
    ).toBe(true);
    await mcp.dispose();
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
  });

  test("should list before preparation without connecting and preserve selections across restart", async () => {
    const {
      runs,
      mcp,
      cwd,
      strategyPath,
      runRepository,
      managerFactory,
      configurations,
    } = await createMcpFixture();
    const servers = await mcp.listServers({ runId: "root", strategyPath, cwd });
    expect(servers.find((server) => server.id === "private")?.enabled).toBe(
      true,
    );
    expect(managerFactory).not.toHaveBeenCalled();
    await runRepository.saveRunConfig("root", { enabledMcpServerIds: [] });
    await runs.prepareRun({ runId: "root", strategyPath, cwd });
    expect(configurations[0]!.enabledServerIds).toEqual([]);
    expect(
      Object.keys((await mcp.listServers({ runId: "root" }))[0]!),
    ).not.toContain("definition");
    await runs.startRun("root", "first").completion;
    await runs.dispose();
    await mcp.dispose();
    const restartedRuns = createRunsPlugin({ runsDir: cwd });
    const restartedMcp = createMcpPlugin({
      dependencies: { runs: restartedRuns, runRepository },
    });
    const replayed: McpServersUpdated[] = [];
    await restartedMcp.notifications.subscribe(
      "run_mcp_servers_updated",
      "root",
      (event) => {
        replayed.push(event);
      },
    );
    expect(replayed).toHaveLength(1);
    expect(
      replayed[0]!.servers.every(
        (server) => !server.enabled && server.connected !== true,
      ),
    ).toBe(true);
    expect(managerFactory).toHaveBeenCalledTimes(1);
    await restartedRuns.prepareRun({ runId: "root" });
    expect(configurations[1]!.enabledServerIds).toEqual([]);
    await restartedRuns.dispose();
    await restartedMcp.dispose();
  });

  test("should serialize selection updates and keep active tools unchanged until continuation", async () => {
    const {
      runs,
      mcp,
      cwd,
      strategyPath,
      configurations,
      toolsByRun,
      runRepository,
    } = await createMcpFixture();
    await runs.prepareRun({ runId: "root", strategyPath, cwd });
    const tools = toolsByRun.get("root");
    await Promise.all([
      mcp.updateServer({
        scope: "run",
        runId: "root",
        serverId: "private",
        enabled: false,
      }),
      mcp.updateServer({
        scope: "run",
        runId: "root",
        serverId: "shared",
        enabled: false,
      }),
      mcp.updateServer({
        scope: "run",
        runId: "root",
        serverId: "disabled",
        enabled: true,
      }),
    ]);
    expect(await runRepository.getRunConfig("root")).toEqual({
      enabledMcpServerIds: ["disabled"],
    });
    expect(configurations).toHaveLength(1);
    expect(toolsByRun.get("root")).toBe(tools);
    expect(
      (await mcp.listServers({ runId: "root" })).find(
        (server) => server.id === "private",
      ),
    ).toMatchObject({ enabled: false, connected: true });
    await runs.startRun("root", "first").completion;
    await runs.prepareRun({ runId: "root" });
    expect(configurations[1]!.enabledServerIds).toEqual(["disabled"]);
    expect(Object.values(toolsByRun.get("root")!.writer!.origins)).toEqual([
      { serverId: "disabled", toolName: "inspect" },
    ]);
    await runs.dispose();
    await mcp.dispose();
  });

  test("should persist shared defaults and reject private or unknown server updates", async () => {
    const { runs, mcp, cwd, strategyPath } = await createMcpFixture();
    await mcp.updateServer({
      scope: "default",
      cwd,
      strategyPath,
      serverId: "disabled",
      enabled: true,
    });
    const configuration = McpConfigFileSchema.parse(
      JSON.parse(await readFile(join(cwd, ".comma", "mcp.json"), "utf8")),
    );
    expect(configuration.mcpServers.disabled!.enabledByDefault).toBe(true);
    expect(
      (await mcp.listServers({ cwd, strategyPath })).find(
        (server) => server.id === "disabled",
      ),
    ).toMatchObject({ enabled: true, enabledByDefault: true });
    await expect(
      mcp.updateServer({
        scope: "default",
        cwd,
        strategyPath,
        serverId: "private",
        enabled: false,
      }),
    ).rejects.toThrow("no shared default");
    await expect(
      mcp.updateServer({
        scope: "run",
        cwd,
        strategyPath,
        serverId: "shared",
        enabled: true,
      }),
    ).rejects.toThrow("runId is required");
    await expect(
      mcp.updateServer({
        scope: "run",
        runId: "root",
        cwd,
        strategyPath,
        serverId: "missing",
        enabled: true,
      }),
    ).rejects.toThrow("Unknown MCP server");
    await runs.dispose();
    await mcp.dispose();
  });

  test("should reject unknown assignments and clean clients if a later provider fails", async () => {
    const { runs, mcp, cwd, strategyPath, managers, managerFactory } =
      await createMcpFixture();
    await writeFile(
      strategyPath,
      JSON.stringify({
        ...strategy,
        agents: { writer: { model: "openai/gpt-4o", mcpServers: ["missing"] } },
      }),
    );
    await expect(
      runs.prepareRun({ runId: "unknown", strategyPath, cwd }),
    ).rejects.toThrow("references unknown MCP server");
    expect(managerFactory).not.toHaveBeenCalled();
    await writeFile(strategyPath, JSON.stringify(strategy));
    runs.registerRunPreparation({
      name: "failure",
      prepare() {
        throw new Error("provider failed");
      },
    });
    await expect(
      runs.prepareRun({ runId: "root", strategyPath, cwd }),
    ).rejects.toThrow("provider failed");
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
    await runs.dispose();
    await mcp.dispose();
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
  });

  test("should notify ancestors of child connections and replay current state", async () => {
    const { runs, mcp, cwd, strategyPath, managers } = await createMcpFixture();
    const notifications: McpServersUpdated[] = [];
    await mcp.notifications.subscribe(
      "run_mcp_servers_updated",
      "root",
      (event) => {
        notifications.push(event);
      },
    );
    await runs.prepareRun({ runId: "root", strategyPath, cwd });
    const replayed: McpServersUpdated[] = [];
    await mcp.notifications.subscribe(
      "run_mcp_servers_updated",
      "root",
      (event) => {
        replayed.push(event);
      },
    );
    expect(replayed).toHaveLength(1);
    expect(replayed[0]!.servers.some((server) => server.connected)).toBe(true);
    expect((await runs.startRun("root", "child").completion).status).toBe(
      "completed",
    );
    expect(managers).toHaveLength(2);
    const child = notifications.find((event) => event.parentRunId === "root");
    expect(child).toBeDefined();
    expect(
      notifications.some(
        (event) =>
          event.runId === child!.runId &&
          event.servers.every((server) => server.connected !== true),
      ),
    ).toBe(true);
    for (const manager of managers) {
      expect(manager.close).toHaveBeenCalledTimes(1);
    }
    await mcp.dispose();
  });

  test("should close clients that arrive after preparation cancellation", async () => {
    const { runs, mcp, cwd, strategyPath, managerFactory, managers } =
      await createMcpFixture();
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const originalFactory = managerFactory.getMockImplementation()!;
    managerFactory.mockImplementation(async (options) => {
      entered.resolve();
      await gate.promise;
      return originalFactory(options);
    });
    const prepared = runs.prepareRun({ runId: "root", strategyPath, cwd });
    await entered.promise;
    const stopped = runs.stopRun("root");
    gate.resolve();
    expect((await prepared).phase).toBe("cancelled");
    await stopped;
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
    await mcp.dispose();
  });

  test("should wait for in-flight clients during plugin disposal and close them once", async () => {
    const { runs, mcp, cwd, strategyPath, managerFactory, managers } =
      await createMcpFixture();
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const originalFactory = managerFactory.getMockImplementation()!;
    managerFactory.mockImplementation(async (options) => {
      entered.resolve();
      await gate.promise;
      return originalFactory(options);
    });
    const prepared = runs.prepareRun({ runId: "root", strategyPath, cwd });
    await entered.promise;
    const disposal = mcp.dispose();
    expect(mcp.dispose()).toBe(disposal);
    await Promise.resolve();
    gate.resolve();
    await expect(prepared).rejects.toThrow("stopped");
    await disposal;
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
    await expect(mcp.listServers({ runId: "root" })).rejects.toThrow(
      "disposed",
    );
    await expect(
      mcp.notifications.subscribe("run_mcp_servers_updated", "root", () => {}),
    ).rejects.toThrow("disposed");
    await runs.dispose();
  });

  test("should close the manager if constructing agent tools throws", async () => {
    const { runs, mcp, cwd, strategyPath, managerFactory, managers } =
      await createMcpFixture();
    const originalFactory = managerFactory.getMockImplementation()!;
    managerFactory.mockImplementation(async (options) => {
      const manager: McpConnectionManager = await originalFactory(options);
      spyOn(manager, "toolsFor").mockImplementation(() => {
        throw new Error("tool mapping failed");
      });
      return manager;
    });
    await expect(
      runs.prepareRun({ runId: "root", strategyPath, cwd }),
    ).rejects.toThrow("tool mapping failed");
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
    await mcp.dispose();
  });

  test("should retain failed connection statuses without failing strategy preparation", async () => {
    const {
      runs,
      mcp,
      cwd,
      strategyPath,
      managerFactory,
      toolsByRun,
      managers,
    } = await createMcpFixture();
    const originalFactory = managerFactory.getMockImplementation()!;
    managerFactory.mockImplementation(async (options) => {
      const manager = await originalFactory(options);
      return {
        ...manager,
        statuses: manager.statuses.map((status) => ({
          ...status,
          connected: false,
          toolCount: 0,
          ...(status.enabled ? { error: "Connection unavailable" } : {}),
        })),
        toolsFor: () => ({ tools: {}, origins: {} }),
      };
    });
    expect(
      (await runs.prepareRun({ runId: "root", strategyPath, cwd })).phase,
    ).toBe("prepared");
    expect(
      (await mcp.listServers({ runId: "root" })).find(
        (server) => server.id === "shared",
      ),
    ).toMatchObject({
      enabled: true,
      connected: false,
      error: "Connection unavailable",
    });
    expect(toolsByRun.get("root")!.writer).toEqual({ tools: {}, origins: {} });
    await runs.dispose();
    expect(managers[0]!.close).toHaveBeenCalledTimes(1);
    await mcp.dispose();
  });
});
