import type { HandlerContext } from "../../dispatcher.types";
import type { ListMcpServersMessage } from "./list-mcp-servers.schema";

export { ListMcpServersMessage } from "./list-mcp-servers.schema";

export async function handleListMcpServers(
  message: ListMcpServersMessage,
  context: HandlerContext<"list_mcp_servers">,
): Promise<void> {
  try {
    const servers = await context.runSystem.listMcpServers({
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
      code: "MCP_LIST_FAILED",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  }
}
