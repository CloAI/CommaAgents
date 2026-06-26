import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  createMcpConnectionManager,
  discoverMcpConfig,
  isLLMAgentDef,
  parseStrategyFromString,
  readStrategyFile,
} from "@comma-agents/core";

import type {
  ResolvedRunMcpConfig,
  ResolveRunMcpConfigOptions,
  RunMcpRuntime,
  RunMcpServerStatus,
} from "./mcp.types";

/** Resolve layered MCP definitions, agent assignments, and the persisted selection. */
export async function resolveRunMcpConfig({
  strategyPath,
  cwd,
  runId,
  runStore,
  persistDefaults = false,
}: ResolveRunMcpConfigOptions): Promise<ResolvedRunMcpConfig> {
  const shared = discoverMcpConfig({ cwd });
  const servers = new Map(shared.servers);
  const assignments = new Map<string, string[]>();

  if (strategyPath) {
    const strategyFile = await readStrategyFile(strategyPath);
    const strategy = parseStrategyFromString(
      strategyFile.content,
      strategyFile.format,
    );
    for (const [serverId, definition] of Object.entries(
      strategy.mcpServers ?? {},
    )) {
      servers.set(serverId, {
        id: serverId,
        definition,
        source: "strategy",
        baseDir: dirname(strategyPath),
      });
    }

    for (const [agentName, agentDefinition] of Object.entries(
      strategy.agents,
    )) {
      if (!isLLMAgentDef(agentDefinition)) continue;
      for (const serverId of agentDefinition.mcpServers ?? []) {
        if (!servers.has(serverId)) {
          throw new Error(
            `Agent "${agentName}" references unknown MCP server "${serverId}".`,
          );
        }
        const assignedAgents = assignments.get(serverId) ?? [];
        assignedAgents.push(agentName);
        assignments.set(serverId, assignedAgents);
      }
    }
  }

  const existingConfig = runId ? await runStore.getRunConfig(runId) : undefined;
  const defaultCandidates = strategyPath
    ? Array.from(assignments.keys())
    : Array.from(servers.keys());
  const defaultEnabledIds = defaultCandidates.filter((serverId) => {
    const entry = servers.get(serverId);
    return (
      entry?.source === "strategy" ||
      entry?.definition.enabledByDefault === true
    );
  });
  const enabledServerIds = existingConfig
    ? [...existingConfig.enabledMcpServerIds]
    : defaultEnabledIds;

  if (persistDefaults && runId && !existingConfig) {
    await runStore.saveRunConfig(runId, {
      enabledMcpServerIds: enabledServerIds,
    });
  }

  return { servers, assignments, enabledServerIds };
}

/** Connect the enabled assigned servers and build per-agent tool sets. */
export async function createRunMcpRuntime(
  config: ResolvedRunMcpConfig,
): Promise<RunMcpRuntime> {
  const assignedServers = new Map(
    Array.from(config.servers.entries()).filter(([serverId]) =>
      config.assignments.has(serverId),
    ),
  );
  const manager = await createMcpConnectionManager({
    servers: assignedServers,
    enabledServerIds: config.enabledServerIds,
  });
  const toolsByAgent: Record<string, ReturnType<typeof manager.toolsFor>> = {};
  const serverIdsByAgent = new Map<string, string[]>();
  for (const [serverId, agentNames] of config.assignments) {
    for (const agentName of agentNames) {
      const serverIds = serverIdsByAgent.get(agentName) ?? [];
      serverIds.push(serverId);
      serverIdsByAgent.set(agentName, serverIds);
    }
  }
  for (const [agentName, serverIds] of serverIdsByAgent) {
    toolsByAgent[agentName] = manager.toolsFor(serverIds);
  }

  const statuses = manager.statuses.map(
    (status): RunMcpServerStatus => ({
      ...status,
      enabledByDefault:
        config.servers.get(status.id)?.definition.enabledByDefault === true,
      assignedAgents: config.assignments.get(status.id) ?? [],
    }),
  );

  return { manager, toolsByAgent, statuses };
}

/** Persist a shared server's global/workspace default enablement. */
export function updateMcpDefault(
  config: ResolvedRunMcpConfig,
  serverId: string,
  enabled: boolean,
): void {
  const entry = config.servers.get(serverId);
  if (!entry) throw new Error(`Unknown MCP server: ${serverId}`);
  if (entry.source === "strategy" || !entry.configPath) {
    throw new Error(
      `Strategy-private MCP server "${serverId}" has no shared default.`,
    );
  }

  const parsed = JSON.parse(readFileSync(entry.configPath, "utf8")) as {
    mcpServers?: Record<string, Record<string, unknown>>;
  };
  const definition = parsed.mcpServers?.[serverId];
  if (!definition) {
    throw new Error(
      `MCP server "${serverId}" is missing from ${entry.configPath}`,
    );
  }
  definition.enabledByDefault = enabled;
  mkdirSync(dirname(entry.configPath), { recursive: true });
  const temporaryPath = `${entry.configPath}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, entry.configPath);
}

/** Build list-safe status before or after a connection attempt. */
export function listRunMcpStatuses(
  config: ResolvedRunMcpConfig,
  connectedStatuses: readonly RunMcpServerStatus[] = [],
): readonly RunMcpServerStatus[] {
  const connectedById = new Map(
    connectedStatuses.map((status) => [status.id, status]),
  );
  const enabledIds = new Set(config.enabledServerIds);
  return Array.from(config.servers.values(), (entry) => {
    const connected = connectedById.get(entry.id);
    return (
      connected ?? {
        id: entry.id,
        source: entry.source,
        transport: entry.definition.transport,
        enabled: enabledIds.has(entry.id),
        enabledByDefault: entry.definition.enabledByDefault === true,
        toolCount: 0,
        assignedAgents: config.assignments.get(entry.id) ?? [],
      }
    );
  });
}
