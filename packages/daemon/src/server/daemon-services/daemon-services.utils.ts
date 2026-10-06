import type { HubManager } from "@comma-agents/core/hub";
import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../daemon-store";
import type { HandlerContext } from "../protocol/dispatcher/dispatcher.types";
import type {
  ClientMessageType,
  DaemonRouteContext,
} from "./daemon-services.types";

interface CreateHandlerContextOptions<MessageType extends ClientMessageType> {
  readonly routeContext: DaemonRouteContext<MessageType>;
  readonly daemonRunState: DaemonRunState;
  readonly daemonStore: DaemonStore;

  readonly hubManager?: HubManager;
}

/**
 * Adapt the small service route context to existing request handlers.
 *
 * @param {CreateHandlerContextOptions<MessageType>} options - Route context and daemon services.
 * @returns {HandlerContext<MessageType>} Context expected by protocol request handlers.
 */
export function createHandlerContext<MessageType extends ClientMessageType>({
  routeContext,
  daemonRunState,
  daemonStore,
  hubManager,
}: CreateHandlerContextOptions<MessageType>): HandlerContext<MessageType> {
  return {
    clientId: routeContext.clientId,
    daemonRunState,
    daemonStore,
    hubManager,
    reply: routeContext.reply,
  };
}
