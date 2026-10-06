import type { DaemonRunState } from "../../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import { handleListMcpServers } from "../../protocol/requests/list-mcp-servers";
import { handleUpdateMcpServer } from "../../protocol/requests/update-mcp-server";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createMcpService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore };
  return {
    name: "mcp",
    routes: [
      defineDaemonRoute("list_mcp_servers", (message, routeContext) =>
        handleListMcpServers(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("update_mcp_server", (message, routeContext) =>
        handleUpdateMcpServer(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
