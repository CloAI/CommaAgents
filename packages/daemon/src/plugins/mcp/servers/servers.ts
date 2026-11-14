import { updateMcpServerDefault } from "@comma-agents/core/mcp";
import type {
  ListMcpServersOptions,
  RunMcpServerStatus,
  UpdateMcpServerOptions,
} from "../mcp.types";
import type { McpContext } from "../state/state.types";
import { resolveMcpConfiguration, listMcpStatuses } from "../configuration";
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
  if (options.runId && !run) {
    throw new Error(`Run was not found: ${options.runId}`);
  }
  const configuration = await resolveMcpConfiguration({
    cwd: run?.configuration.cwd ?? options.cwd ?? process.cwd(),
    strategyPath: run?.configuration.strategyPath ?? options.strategyPath,
    overrides: run?.configuration.mcpServerOverrides,
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
  if (options.runId && !run) {
    throw new Error(`Run was not found: ${options.runId}`);
  }
  const cwd = run?.configuration.cwd ?? options.cwd ?? process.cwd();
  const configuration = await resolveMcpConfiguration({
    cwd,
    strategyPath: run?.configuration.strategyPath ?? options.strategyPath,
    overrides: run?.configuration.mcpServerOverrides,
  });
  if (context.disposed) {
    throw new Error("MCP plugin has been disposed");
  }
  const entry = configuration.servers.get(options.serverId);
  if (!entry && options.enabled !== null) {
    throw new Error(`Unknown MCP server: ${options.serverId}`);
  }
  if (options.scope === "default") {
    if (entry?.source === "strategy") {
      throw new Error(
        `Strategy-private MCP server "${options.serverId}" has no shared default.`,
      );
    }
    updateMcpServerDefault({
      cwd,
      serverId: options.serverId,
      enabled: options.enabled,
    });
  } else {
    await context.runs.setMcpServerOverride(
      options.runId,
      options.serverId,
      options.enabled,
    );
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
