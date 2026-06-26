import type { HandlerContext } from "../../dispatcher.types";
import type { UpdateMcpServerMessage } from "./update-mcp-server.schema";

export { UpdateMcpServerMessage } from "./update-mcp-server.schema";

export async function handleUpdateMcpServer(
  message: UpdateMcpServerMessage,
  context: HandlerContext<"update_mcp_server">,
): Promise<void> {
  try {
    const servers = await context.runSystem.updateMcpServer({
      serverId: message.serverId,
      enabled: message.enabled,
      scope: message.scope,
      ...(message.cwd ? { cwd: message.cwd } : {}),
      ...(message.runId ? { runId: message.runId } : {}),
      ...(message.strategyPath ? { strategyPath: message.strategyPath } : {}),
    });
    context.reply({
      type: "mcp_server_list",
      servers: servers.map((server) => ({
        ...server,
        assignedAgents: [...server.assignedAgents],
      })),
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  } catch (caughtError) {
    context.reply({
      type: "error",
      code: "MCP_UPDATE_FAILED",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  }
}
