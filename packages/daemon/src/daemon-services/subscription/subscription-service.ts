import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { Logger } from "../../logger/logger.types";
import { handleListStrategies } from "../../server/protocol/requests/list-strategies";
import { handleSubscribe } from "../../server/protocol/requests/subscribe";
import { handleUnsubscribe } from "../../server/protocol/requests/unsubscribe";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createSubscriptionService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
  logger: Logger,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore, logger };
  return {
    name: "subscriptions",
    routes: [
      defineDaemonRoute("subscribe", (message, routeContext) =>
        handleSubscribe(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("unsubscribe", (message, routeContext) =>
        handleUnsubscribe(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("list_strategies", (message, routeContext) =>
        handleListStrategies(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
