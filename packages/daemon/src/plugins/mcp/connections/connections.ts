import { createMcpConnectionManager } from "@comma-agents/core/mcp";
import type { McpAgentToolSet } from "@comma-agents/core/mcp";
import type { RunPreparationContext, RunPreparationResult } from "../../runs";
import { listMcpStatuses, resolveMcpConfiguration } from "../configuration";
import { queueMcpConfiguration, setMcpSnapshot } from "../state";
import type { McpContext, McpRunResources } from "../state/state.types";

/**
 * Close one execution's clients once and publish disconnected server state.
 * @param {McpContext} context - Private feature state.
 * @param {McpRunResources} resources - Execution-owned clients.
 * @returns {Promise<void>} Resolves after clients close.
 * @internal
 */
export function disposeRunMcpResources(
  context: McpContext,
  resources: McpRunResources,
): Promise<void> {
  if (!resources.disposal) {
    resources.disposal = (async () => {
      try {
        await resources.manager.close();
      } finally {
        context.resources.delete(resources.runId);
        const servers = (
          context.snapshots.get(resources.runId)?.servers ?? resources.statuses
        ).map((status) => ({ ...status, connected: false, toolCount: 0 }));
        setMcpSnapshot(
          context,
          resources.runId,
          servers,
          resources.parentRunId,
        );
      }
    })();
  }
  return resources.disposal;
}

async function connectRunMcp(
  context: McpContext,
  preparation: RunPreparationContext,
): Promise<RunPreparationResult> {
  if (context.disposed) {
    throw new Error("MCP plugin has been disposed");
  }
  if (preparation.signal.aborted) {
    throw new DOMException("Run aborted", "AbortError");
  }
  const configuration = await queueMcpConfiguration(context, () =>
    resolveMcpConfiguration({
      strategyPath: preparation.strategyPath,
      cwd: preparation.cwd,
      runId: preparation.runId,
      runRepository: context.repository,
      persistDefaults: true,
    }),
  );
  if (context.disposed || preparation.signal.aborted) {
    throw new DOMException("MCP preparation stopped", "AbortError");
  }
  const assignedServers = new Map(
    [...configuration.servers].filter(([serverId]) =>
      configuration.assignments.has(serverId),
    ),
  );
  const manager = await createMcpConnectionManager({
    servers: assignedServers,
    enabledServerIds: configuration.enabledServerIds,
  });
  let resources: McpRunResources | undefined;
  try {
    if (context.disposed || preparation.signal.aborted) {
      throw new DOMException("MCP preparation stopped", "AbortError");
    }
    const serverIdsByAgent = new Map<string, string[]>();
    for (const [serverId, agentNames] of configuration.assignments) {
      for (const agentName of agentNames) {
        const serverIds = serverIdsByAgent.get(agentName) ?? [];
        serverIds.push(serverId);
        serverIdsByAgent.set(agentName, serverIds);
      }
    }
    const toolsByAgent: Record<string, McpAgentToolSet> = {};
    for (const [agentName, serverIds] of serverIdsByAgent) {
      toolsByAgent[agentName] = manager.toolsFor(serverIds);
    }
    const statuses = listMcpStatuses(
      configuration,
      manager.statuses.map((status) => ({
        ...status,
        enabledByDefault:
          configuration.servers.get(status.id)?.definition.enabledByDefault ===
          true,
        assignedAgents: configuration.assignments.get(status.id) ?? [],
      })),
    );
    resources = {
      runId: preparation.runId,
      ...(preparation.parentRunId
        ? { parentRunId: preparation.parentRunId }
        : {}),
      configuration,
      manager,
      statuses,
    };
    context.resources.set(preparation.runId, resources);
    setMcpSnapshot(context, resources.runId, statuses, resources.parentRunId);
    const acquiredResources = resources;
    return {
      strategyInputs: { mcpToolsByAgent: toolsByAgent },
      dispose: () => disposeRunMcpResources(context, acquiredResources),
    };
  } catch (error) {
    if (resources) {
      await disposeRunMcpResources(context, resources);
    } else {
      await manager.close();
    }
    throw error;
  }
}

/**
 * Track connection acquisition so disposal waits for late clients and releases them.
 * @param {McpContext} context - Private feature state.
 * @param {RunPreparationContext} preparation - Root or child execution settings.
 * @returns {Promise<RunPreparationResult>} Agent tools and connection cleanup.
 * @internal
 */
export function prepareRunMcp(
  context: McpContext,
  preparation: RunPreparationContext,
): Promise<RunPreparationResult> {
  const completion = connectRunMcp(context, preparation);
  context.preparations.add(completion);
  void completion.then(
    () => context.preparations.delete(completion),
    () => context.preparations.delete(completion),
  );
  return completion;
}

/**
 * Prevent new work and close active and in-flight execution clients.
 * @param {McpContext} context - Private feature state.
 * @returns {Promise<void>} Resolves after all owned clients close.
 * @internal
 */
export async function disposeMcp(context: McpContext): Promise<void> {
  context.disposed = true;
  await context.configurationWork;
  await Promise.allSettled(context.preparations);
  const results = await Promise.allSettled(
    [...context.resources.values()].map((resources) =>
      disposeRunMcpResources(context, resources),
    ),
  );
  context.snapshots.clear();
  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason;
    }
  }
}
