import type { HubManager } from "@comma-agents/core/hub";
import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { Logger } from "../../logger/logger.types";
import {
  handleHubInstall,
  handleHubList,
  handleHubRemove,
  handleHubUpdate,
} from "../../server/protocol/requests/hub-packages";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createHubService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
  hubManager: HubManager,
  logger: Logger,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore, hubManager, logger };
  return {
    name: "hub",
    routes: [
      defineDaemonRoute("hub_list", (message, routeContext) =>
        handleHubList(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("hub_install", (message, routeContext) =>
        handleHubInstall(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("hub_update", (message, routeContext) =>
        handleHubUpdate(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("hub_remove", (message, routeContext) =>
        handleHubRemove(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
