import type {
  ListMcpServersOptions,
  RunMcpServerStatus,
  UpdateMcpServerOptions,
} from "../mcp.types";
import type { McpContext } from "../state/state.types";
import {
  resolveMcpConfiguration,
  updateMcpDefault,
  listMcpStatuses,
} from "../configuration";
import { queueMcpConfiguration, setMcpSnapshot } from "../state";

/**
 * Inspect shared definitions or an execution's selection without opening clients.
 * @param {McpContext} context - Private feature state.
 * @param {ListMcpServersOptions} options - Execution, strategy, and workspace to inspect.
 * @returns {Promise<readonly RunMcpServerStatus[]>} Display-safe server states.
 * @internal
 */
export async function listMcpServers(
  context: McpContext,
  options: ListMcpServersOptions,
): Promise<readonly RunMcpServerStatus[]> {
  if (context.disposed) {
    throw new Error("MCP plugin has been disposed");
  }
  await context.configurationWork;
  const run = options.runId
    ? await context.runs.getRun(options.runId)
    : undefined;
  const configuration = await resolveMcpConfiguration({
    cwd: options.cwd ?? run?.configuration.cwd ?? process.cwd(),
    strategyPath: options.strategyPath ?? run?.configuration.strategyPath,
    runId: options.runId,
    runRepository: context.repository,
  });
  if (context.disposed) {
    throw new Error("MCP plugin has been disposed");
  }
  const connectedStatuses = options.runId
    ? (context.resources.get(options.runId)?.statuses ??
      context.snapshots.get(options.runId)?.servers)
    : undefined;
  const servers = listMcpStatuses(configuration, connectedStatuses);
  if (options.runId && run) {
    setMcpSnapshot(context, options.runId, servers, run.parentRunId, false);
  }
  return servers;
}

async function persistMcpUpdate(
  context: McpContext,
  options: UpdateMcpServerOptions,
): Promise<void> {
  if (context.disposed) {
    throw new Error("MCP plugin has been disposed");
  }
  if (options.scope === "run" && !options.runId) {
    throw new Error("runId is required for a run-scoped MCP update");
  }
  const run = options.runId
    ? await context.runs.getRun(options.runId)
    : undefined;
  const configuration = await resolveMcpConfiguration({
    cwd: options.cwd ?? run?.configuration.cwd ?? process.cwd(),
    strategyPath: options.strategyPath ?? run?.configuration.strategyPath,
    runId: options.runId,
    runRepository: context.repository,
  });
  if (context.disposed) {
    throw new Error("MCP plugin has been disposed");
  }
  if (options.scope === "default") {
    updateMcpDefault(configuration, options.serverId, options.enabled);
  } else {
    if (!configuration.servers.has(options.serverId)) {
      throw new Error(`Unknown MCP server: ${options.serverId}`);
    }
    const enabledIds = new Set(configuration.enabledServerIds);
    if (options.enabled) {
      enabledIds.add(options.serverId);
    } else {
      enabledIds.delete(options.serverId);
    }
    const existingConfig = await context.repository.getRunConfig(
      options.runId!,
    );
    await context.repository.saveRunConfig(options.runId!, {
      ...existingConfig,
      enabledMcpServerIds: [...enabledIds],
    });
  }
}

/**
 * Persist enablement for future preparation and notify a known execution.
 * @param {McpContext} context - Private feature state.
 * @param {UpdateMcpServerOptions} options - Shared default or per-execution change.
 * @returns {Promise<readonly RunMcpServerStatus[]>} Updated selections and current connections.
 * @internal
 */
export async function updateMcpServer(
  context: McpContext,
  options: UpdateMcpServerOptions,
): Promise<readonly RunMcpServerStatus[]> {
  await queueMcpConfiguration(context, () =>
    persistMcpUpdate(context, options),
  );
  const servers = await listMcpServers(context, options);
  if (options.runId) {
    const snapshot = context.snapshots.get(options.runId);
    if (snapshot) {
      context.notifications.notify(options.runId, snapshot);
    }
  }
  return servers;
}
