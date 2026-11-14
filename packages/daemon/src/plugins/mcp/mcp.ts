import { createPlugin } from "../../daemon-plugin";
import { prepareRunMcp, disposeMcp } from "./connections";
import { listMcpServers, updateMcpServer } from "./servers";
import type { CreateMcpPluginOptions, McpPlugin } from "./mcp.types";
import type { McpNotifications } from "./mcp.notifications";
import type { McpContext } from "./state/state.types";

/**
 * Register execution-owned MCP tools and expose persisted server selection.
 * @param {CreateMcpPluginOptions} options - Current runs plugin dependency.
 * @returns {McpPlugin} Server controls, subscriptions, and connection cleanup.
 * @example
 * ```ts
 * const mcp = createMcpPlugin({ dependencies: { runs } });
 * const servers = await mcp.listServers({ runId });
 * ```
 */
export function createMcpPlugin({
  dependencies,
}: CreateMcpPluginOptions): McpPlugin {
  const { plugin, notifications } = createPlugin<"mcp", McpNotifications>({
    name: "mcp",
    notifications: true,
    cleanup: () => disposeMcp(context),
    notificationHooks: {
      getRecipientKeys: (runId) =>
        dependencies.runs
          .getRunLineage(runId)
          .map((identity) => identity.runId),
      beforeSubscribe: async (_type, runId) => {
        const run = await dependencies.runs.getRun(runId);
        if (run) {
          await listMcpServers(context, { runId });
        }
      },
      onSubscribe: (_type, runId, deliver) => {
        const snapshot = context.snapshots.get(runId);
        if (snapshot) {
          deliver(snapshot);
        }
      },
    },
  });
  const context: McpContext = {
    runs: dependencies.runs,
    notifications,
    resources: new Map(),
    snapshots: new Map(),
    preparations: new Set(),
    configurationWork: Promise.resolve(),
    disposed: false,
  };
  dependencies.runs.registerRunPreparation({
    name: "mcp",
    prepare: (preparation) => prepareRunMcp(context, preparation),
  });
  return {
    ...plugin,
    listServers: (options = {}) => listMcpServers(context, options),
    updateServer: (options) => updateMcpServer(context, options),
  };
}
