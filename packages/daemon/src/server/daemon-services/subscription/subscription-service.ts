import type { DaemonRunState } from "../../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import { handleListStrategies } from "../../protocol/requests/list-strategies";
import { handleSubscribe } from "./subscribe";
import { handleUnsubscribe } from "./unsubscribe";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

// AI: Maybe we should rename this service into RunSubscription service? Since it is more about subscribing to runs than just "subscriptions"

export function createSubscriptionService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore };
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
      // AI: Shouldn't this really exist in a separate service?
      defineDaemonRoute("list_strategies", (message, routeContext) =>
        handleListStrategies(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
