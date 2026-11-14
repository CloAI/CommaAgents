import { RunPhase, RunOutcomeStatus } from "../runs/state/state.schemas";
import { afterEach, describe, expect } from "vitest";
import { test, vi } from "vitest";
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
      configurations,
      toolsByRun,
      managers,
    } = fixture;
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath,
        cwd,
      },
    });
    expect([...configurations[0]!.servers.keys()].sort()).toEqual([
      "disabled",
      "private",
      "shared",
    ]);
    expect(configurations[0]!.enabledServerIds).toEqual(["shared", "private"]);
    expect(
      (await runs.getRun("root"))?.configuration.mcpServerOverrides,
    ).toBeUndefined();
    await expect(readFile(join(cwd, "root.config.json"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
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
    const { runs, mcp, cwd, strategyPath, managerFactory, configurations } =
      await createMcpFixture();
    const servers = await mcp.listServers({ strategyPath, cwd });
    expect(servers.find((server) => server.id === "private")?.enabled).toBe(
      true,
    );
    expect(managerFactory).not.toHaveBeenCalled();
    await writeFile(
      join(cwd, "root.config.json"),
      JSON.stringify({ enabledMcpServerIds: ["shared"] }),
    );
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath,
        cwd,
        mcpServerOverrides: { shared: false, private: false },
      },
    });
    expect(configurations[0]!.enabledServerIds).toEqual([]);
    expect(
      Object.keys((await mcp.listServers({ runId: "root" }))[0]!),
    ).not.toContain("definition");
    await runs.startRun("root", "first").completion;
    await runs.dispose();
    await mcp.dispose();
    const restartedRuns = createRunsPlugin({ runsDir: cwd });
    const restartedMcp = createMcpPlugin({
      dependencies: { runs: restartedRuns },
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
    const { runs, mcp, cwd, strategyPath, configurations, toolsByRun } =
      await createMcpFixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath,
        cwd,
      },
    });
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
    expect(
      (await runs.getRun("root"))?.configuration.mcpServerOverrides,
    ).toEqual({ private: false, shared: false, disabled: true });
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
      // @ts-expect-error Verify missing run IDs are rejected at runtime too.
      mcp.updateServer({
        scope: "run",
        cwd,
        strategyPath,
        serverId: "shared",
        enabled: true,
      }),
    ).rejects.toThrow("runId is required");
    await runs.prepareRun({
      runId: "root",
      configuration: { strategyPath, cwd },
    });
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
      runs.prepareRun({
        runId: "unknown",
        configuration: {
          strategyPath,
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    expect(managerFactory).not.toHaveBeenCalled();
    await writeFile(strategyPath, JSON.stringify(strategy));
    runs.registerRunPreparation({
      name: "failure",
      prepare() {
        throw new Error("provider failed");
      },
    });
    await expect(
      runs.prepareRun({
        runId: "root",
        configuration: {
          strategyPath,
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
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
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath,
        cwd,
      },
    });
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
      RunOutcomeStatus.completed,
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
    const prepared = runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath,
        cwd,
      },
    });
    await entered.promise;
    const stopped = runs.stopRun("root");
    gate.resolve();
    expect(await prepared).toMatchObject({
      phase: "terminal",
      outcome: { status: "stopped" },
    });
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
    const prepared = runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath,
        cwd,
      },
    });
    await entered.promise;
    const disposal = mcp.dispose();
    expect(mcp.dispose()).toBe(disposal);
    await Promise.resolve();
    gate.resolve();
    await expect(prepared).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
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
      vi.spyOn(manager, "toolsFor").mockImplementation(() => {
        throw new Error("tool mapping failed");
      });
      return manager;
    });
    await expect(
      runs.prepareRun({
        runId: "root",
        configuration: {
          strategyPath,
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
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
      (
        await runs.prepareRun({
          runId: "root",
          configuration: {
            strategyPath,
            cwd,
          },
        })
      ).phase,
    ).toBe(RunPhase.prepared);
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
  test("should follow changed defaults and reset an explicit override without writing legacy sidecars", async () => {
    const { runs, mcp, cwd, strategyPath, configurations } =
      await createMcpFixture();
    await writeFile(
      join(cwd, "root.config.json"),
      JSON.stringify({ enabledMcpServerIds: [] }),
    );
    await runs.prepareRun({
      runId: "root",
      configuration: { strategyPath, cwd },
    });
    expect(configurations[0]!.enabledServerIds).toEqual(["shared", "private"]);
    await mcp.updateServer({
      scope: "run",
      runId: "root",
      serverId: "shared",
      enabled: false,
    });
    expect(
      (await runs.getRun("root"))?.configuration.mcpServerOverrides,
    ).toEqual({ shared: false });
    await mcp.updateServer({
      scope: "run",
      runId: "root",
      serverId: "shared",
      enabled: null,
    });
    expect(
      (await runs.getRun("root"))?.configuration.mcpServerOverrides,
    ).toBeUndefined();
    expect(
      (await mcp.listServers({ runId: "root" })).find(
        (server) => server.id === "shared",
      )?.enabled,
    ).toBe(true);
    await mcp.updateServer({
      scope: "default",
      runId: "root",
      serverId: "shared",
      enabled: false,
    });
    await runs.startRun("root", "done").completion;
    await runs.prepareRun({ runId: "root" });
    expect(configurations[1]!.enabledServerIds).toEqual(["private"]);
    expect(
      JSON.parse(await readFile(join(cwd, "root.config.json"), "utf8")),
    ).toEqual({ enabledMcpServerIds: [] });
    await runs.dispose();
    await mcp.dispose();
  });

  test("should retain explicit choices across strategy switches while enabling newly assigned private servers", async () => {
    const { runs, mcp, cwd, strategyPath, configurations } =
      await createMcpFixture();
    await runs.prepareRun({
      runId: "root",
      configuration: { strategyPath, cwd },
    });
    await mcp.updateServer({
      scope: "run",
      runId: "root",
      serverId: "shared",
      enabled: false,
    });
    const nextPath = join(cwd, "next.json");
    await writeFile(
      nextPath,
      JSON.stringify({
        ...strategy,
        mcpServers: {
          ...strategy.mcpServers,
          later: { transport: "stdio", command: "never-started" },
        },
        agents: {
          writer: {
            ...strategy.agents.writer,
            mcpServers: [...strategy.agents.writer.mcpServers, "later"],
          },
        },
      }),
    );
    await runs.switchStrategy({ runId: "root", strategyPath: nextPath });
    expect(
      (await runs.getRun("root"))?.configuration.mcpServerOverrides,
    ).toEqual({ shared: false });
    expect(configurations.at(-1)!.enabledServerIds).toEqual([
      "private",
      "later",
    ]);
    await runs.dispose();
    await mcp.dispose();
  });

  test("should copy overrides with a completed checkpoint and keep copied choices independent", async () => {
    const { runs, mcp, cwd, strategyPath } = await createMcpFixture();
    await runs.prepareRun({
      runId: "root",
      configuration: { strategyPath, cwd },
    });
    await mcp.updateServer({
      scope: "run",
      runId: "root",
      serverId: "private",
      enabled: false,
    });
    await runs.startRun("root", "done").completion;
    await runs.copyRun({ runId: "root", targetRunId: "copy", cwd });
    expect(
      (await runs.getRun("copy"))?.configuration.mcpServerOverrides,
    ).toEqual({ private: false });
    await mcp.updateServer({
      scope: "run",
      runId: "root",
      serverId: "private",
      enabled: true,
    });
    expect(
      (await runs.getRun("copy"))?.configuration.mcpServerOverrides,
    ).toEqual({ private: false });
    await runs.dispose();
    await mcp.dispose();
  });

  test("should reject mutations of missing runs including path-like identities", async () => {
    const { runs, mcp, cwd, strategyPath } = await createMcpFixture();
    for (const runId of ["missing", "../escape"]) {
      await expect(
        mcp.updateServer({
          scope: "run",
          runId,
          cwd,
          strategyPath,
          serverId: "shared",
          enabled: true,
        }),
      ).rejects.toThrow("Run was not found");
    }
    await expect(mcp.listServers({ runId: "missing" })).rejects.toThrow(
      "Run was not found",
    );
    await runs.dispose();
    await mcp.dispose();
  });
});
