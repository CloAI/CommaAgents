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
  overrides = {},
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

  const candidates = [...servers.keys()];
  const enabledServerIds = candidates.filter((serverId) => {
    const entry = servers.get(serverId)!;
    return Object.hasOwn(overrides, serverId)
      ? overrides[serverId]
      : (!strategyPath || assignments.has(serverId)) &&
          (entry.source === "strategy" ||
            entry.definition.enabledByDefault === true);
  });

  return { servers, assignments, enabledServerIds };
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
