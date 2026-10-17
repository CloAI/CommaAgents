import { mock, spyOn } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as coreMcp from "@comma-agents/core/mcp";
import type {
  CreateMcpConnectionManagerOptions,
  McpAgentToolSet,
  McpConnectionManager,
} from "@comma-agents/core/mcp";
import { z } from "zod";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "../runs/test.utils";
import { createMcpPlugin } from "./mcp";

const connectionMocks: Array<{ mockRestore(): void }> = [];

/**
 * Restore MCP and run mocks and remove temporary workspaces.
 * @returns {void} Nothing; releases test fixtures.
 */
export function cleanupMcpFixtures(): void {
  for (const connectionMock of connectionMocks.splice(0)) {
    connectionMock.mockRestore();
  }
  cleanupRunFixtures();
}

export const strategy = {
  name: "MCP test",
  version: "1.0",
  mcpServers: { private: { transport: "stdio", command: "never-executed" } },
  agents: {
    writer: {
      model: "openai/gpt-4o",
      mcpServers: ["shared", "private", "disabled"],
    },
  },
  flow: { name: "Main", type: "sequential", steps: [{ agent: "writer" }] },
};

/**
 * Construct a workspace with isolated mock connections and a real configuration repository.
 * @returns {Promise<object>} Plugin, runs, workspace, and observable mock clients.
 */
export async function createMcpFixture() {
  const runRepository = repository();
  const cwd = directories.at(-1)!;
  await mkdir(join(cwd, ".comma"), { recursive: true });
  await writeFile(
    join(cwd, ".comma", "mcp.json"),
    JSON.stringify({
      mcpServers: {
        shared: {
          transport: "http",
          url: "https://example.invalid/shared",
          enabledByDefault: true,
        },
        disabled: {
          transport: "http",
          url: "https://example.invalid/disabled",
        },
        unassigned: {
          transport: "sse",
          url: "https://example.invalid/unassigned",
          enabledByDefault: true,
        },
      },
    }),
  );
  const strategyPath = join(cwd, "strategy.json");
  await writeFile(strategyPath, JSON.stringify(strategy));
  await writeFile(join(cwd, "child.json"), JSON.stringify(strategy));
  const loader = fakeLoader({ loads: [], restored: [] });
  const toolsByRun = new Map<
    string,
    Readonly<Record<string, McpAgentToolSet>>
  >();
  const runs = createMockRunsPlugin({
    repository: runRepository,
    async loadStrategy(options) {
      toolsByRun.set(
        options.runId,
        options.strategyInputs.mcpToolsByAgent ?? {},
      );
      return loader({
        ...options,
        launchStrategy: (request) =>
          options.launchStrategy({
            ...request,
            strategyPath: join(cwd, "child.json"),
          }),
      });
    },
  });
  const managers: McpConnectionManager[] = [];
  const configurations: CreateMcpConnectionManagerOptions[] = [];
  const managerFactory = spyOn(
    coreMcp,
    "createMcpConnectionManager",
  ).mockImplementation(async (options) => {
    configurations.push(options);
    const enabled = new Set(options.enabledServerIds);
    const manager: McpConnectionManager = {
      statuses: [...options.servers.values()].map((entry) => ({
        id: entry.id,
        source: entry.source,
        transport: entry.definition.transport,
        enabled: enabled.has(entry.id),
        connected: enabled.has(entry.id),
        toolCount: enabled.has(entry.id) ? 1 : 0,
      })),
      toolsFor(serverIds) {
        const tools: McpAgentToolSet["tools"] = {};
        const origins: Record<string, { serverId: string; toolName: string }> =
          {};
        for (const serverId of serverIds) {
          if (enabled.has(serverId)) {
            const name = coreMcp.namespaceMcpToolName(serverId, "inspect");
            Object.assign(tools, {
              [name]: {
                inputSchema: z.object({}),
                execute: async () => "mock result",
              },
            });
            origins[name] = { serverId, toolName: "inspect" };
          }
        }
        return { tools, origins };
      },
      close: mock(async () => {}),
    };
    managers.push(manager);
    return manager;
  });
  connectionMocks.push(managerFactory);
  const mcp = createMcpPlugin({ dependencies: { runs, runRepository } });
  return {
    runs,
    mcp,
    cwd,
    strategyPath,
    runRepository,
    managers,
    configurations,
    toolsByRun,
    managerFactory,
  };
}
