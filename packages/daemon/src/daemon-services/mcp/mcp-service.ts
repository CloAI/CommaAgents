import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { Logger } from "../../logger/logger.types";
import { handleListMcpServers } from "../../server/protocol/requests/list-mcp-servers";
import { handleUpdateMcpServer } from "../../server/protocol/requests/update-mcp-server";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createMcpService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
  logger: Logger,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore, logger };
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
