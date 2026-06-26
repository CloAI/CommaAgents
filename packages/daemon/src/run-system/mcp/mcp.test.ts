import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createRunStore } from "../run-store";
import { resolveRunMcpConfig } from "./mcp";

const temporaryDirectories: string[] = [];

function createWorkspace(): string {
  const workspace = join(
    process.cwd(),
    ".tmp",
    `daemon-mcp-${crypto.randomUUID()}`,
  );
  mkdirSync(join(workspace, ".comma"), { recursive: true });
  temporaryDirectories.push(workspace);
  return workspace;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveRunMcpConfig", () => {
  it("should derive and persist defaults for assigned shared and private servers", async () => {
    const workspace = createWorkspace();
    const strategyPath = join(workspace, "strategy.json");
    writeFileSync(
      join(workspace, ".comma", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            transport: "http",
            url: "https://example.com/mcp",
            enabledByDefault: true,
          },
          disabled: {
            transport: "sse",
            url: "https://example.com/sse",
          },
        },
      }),
    );
    writeFileSync(
      strategyPath,
      JSON.stringify({
        name: "MCP Test",
        version: "1.0",
        mcpServers: {
          private: { transport: "stdio", command: "private-server" },
        },
        agents: {
          assistant: {
            model: "openai/gpt-4o",
            mcpServers: ["github", "disabled", "private"],
          },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }],
        },
      }),
    );
    const runStore = createRunStore({ runsDir: join(workspace, "runs") });

    const config = await resolveRunMcpConfig({
      strategyPath,
      cwd: workspace,
      runId: "run-1",
      runStore,
      persistDefaults: true,
    });

    expect(config.enabledServerIds.sort()).toEqual(["github", "private"]);
    expect(config.assignments.get("github")).toEqual(["assistant"]);
    expect(config.servers.get("private")?.source).toBe("strategy");
    expect(await runStore.getRunConfig("run-1")).toEqual({
      enabledMcpServerIds: ["github", "private"],
    });
  });

  it("should preserve an existing run override", async () => {
    const workspace = createWorkspace();
    const strategyPath = join(workspace, "strategy.json");
    writeFileSync(
      strategyPath,
      JSON.stringify({
        name: "MCP Test",
        version: "1.0",
        mcpServers: {
          private: { transport: "stdio", command: "private-server" },
        },
        agents: {
          assistant: {
            model: "openai/gpt-4o",
            mcpServers: ["private"],
          },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }],
        },
      }),
    );
    const runStore = createRunStore({ runsDir: join(workspace, "runs") });
    await runStore.saveRunConfig("run-1", { enabledMcpServerIds: [] });

    const config = await resolveRunMcpConfig({
      strategyPath,
      cwd: workspace,
      runId: "run-1",
      runStore,
      persistDefaults: true,
    });

    expect(config.enabledServerIds).toEqual([]);
  });

  it("should reject unknown agent server references", async () => {
    const workspace = createWorkspace();
    const strategyPath = join(workspace, "strategy.json");
    writeFileSync(
      strategyPath,
      JSON.stringify({
        name: "MCP Test",
        version: "1.0",
        agents: {
          assistant: {
            model: "openai/gpt-4o",
            mcpServers: ["missing"],
          },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }],
        },
      }),
    );
    const runStore = createRunStore({ runsDir: join(workspace, "runs") });

    await expect(
      resolveRunMcpConfig({
        strategyPath,
        cwd: workspace,
        runId: "run-1",
        runStore,
      }),
    ).rejects.toThrow(
      'Agent "assistant" references unknown MCP server "missing".',
    );
  });
});
