import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { discoverMcpConfig } from "@comma-agents/core/mcp";
import {
  isLLMAgentDef,
  parseStrategyFromString,
  readStrategyFile,
} from "@comma-agents/core/strategy";
import type {
  ResolvedMcpConfiguration,
  ResolveMcpConfigurationOptions,
} from "./configuration.types";
import type { RunMcpServerStatus } from "../mcp.types";

/**
 * Resolve layered MCP definitions, agent assignments, and the persisted selection.
 *
 * @param {ResolveMcpConfigurationOptions} options - Strategy, workspace, and persistence inputs.
 * @returns {Promise<ResolvedMcpConfiguration>} Resolved servers, assignments, and enabled IDs.
 */
export async function resolveMcpConfiguration({
  strategyPath,
  cwd,
  runId,
  runRepository,
  persistDefaults = false,
}: ResolveMcpConfigurationOptions): Promise<ResolvedMcpConfiguration> {
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
      if (!isLLMAgentDef(agentDefinition)) {
        continue;
      }
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

  const existingConfig = runId
    ? await runRepository.getRunConfig(runId)
    : undefined;
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
    await runRepository.saveRunConfig(runId, {
      enabledMcpServerIds: enabledServerIds,
    });
  }

  return { servers, assignments, enabledServerIds };
}

/**
 * Persist a shared server's global/workspace default enablement.
 *
 * @param {ResolvedMcpConfiguration} config - Resolved configuration containing the server.
 * @param {string} serverId - Shared server whose default is updated.
 * @param {boolean} enabled - Whether the server is enabled by default.
 * @returns {void} Nothing; writes the shared MCP configuration.
 */
export function updateMcpDefault(
  config: ResolvedMcpConfiguration,
  serverId: string,
  enabled: boolean,
): void {
  const entry = config.servers.get(serverId);
  if (!entry) {
    throw new Error(`Unknown MCP server: ${serverId}`);
  }
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

/**
 * Build list-safe status before or after a connection attempt.
 *
 * @param {ResolvedMcpConfiguration} config - Resolved server configuration.
 * @param {readonly RunMcpServerStatus[]} [connectedStatuses] - Statuses from an active runtime.
 * @returns {readonly RunMcpServerStatus[]} Status for every configured MCP server.
 */
export function listMcpStatuses(
  config: ResolvedMcpConfiguration,
  connectedStatuses: readonly RunMcpServerStatus[] = [],
): readonly RunMcpServerStatus[] {
  const connectedById = new Map(
    connectedStatuses.map((status) => [status.id, status]),
  );
  const enabledIds = new Set(config.enabledServerIds);
  return Array.from(config.servers.values(), (entry) => {
    const connected = connectedById.get(entry.id);
    return {
      id: entry.id,
      source: entry.source,
      transport: entry.definition.transport,
      enabled: enabledIds.has(entry.id),
      enabledByDefault: entry.definition.enabledByDefault === true,
      toolCount: connected?.toolCount ?? 0,
      assignedAgents: config.assignments.get(entry.id) ?? [],
      ...(connected
        ? {
            connected: connected.connected,
            ...(connected.error ? { error: connected.error } : {}),
          }
        : {}),
    };
  });
}
