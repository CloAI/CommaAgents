import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { Logger } from "../../logger/logger.types";
import { handlePing } from "../../server/protocol/requests/ping";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createCoreService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
  logger: Logger,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore, logger };
  return {
    name: "core",
    routes: [
      defineDaemonRoute("ping", (message, routeContext) =>
        handlePing(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
