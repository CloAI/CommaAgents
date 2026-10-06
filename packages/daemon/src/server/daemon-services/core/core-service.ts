import type { DaemonRunState } from "../../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import { handlePing } from "../../protocol/requests/ping";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createCoreService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore };
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
