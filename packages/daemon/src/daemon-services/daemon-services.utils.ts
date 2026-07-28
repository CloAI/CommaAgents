import type { HubManager } from "@comma-agents/core/hub";
import type { DaemonRunState } from "../daemon-run-state";
import type { DaemonStore } from "../daemon-store";
import type { Logger } from "../logger/logger.types";
import type { HandlerContext } from "../server/protocol/dispatcher/dispatcher.types";
import type {
  ClientMessageType,
  DaemonRouteContext,
} from "./daemon-services.types";

interface CreateHandlerContextOptions<MessageType extends ClientMessageType> {
  readonly routeContext: DaemonRouteContext<MessageType>;
  readonly daemonRunState: DaemonRunState;
  readonly daemonStore: DaemonStore;
  readonly logger: Logger;
  readonly hubManager?: HubManager;
}

/** Adapt the small service route context to existing request handlers. */
export function createHandlerContext<MessageType extends ClientMessageType>({
  routeContext,
  daemonRunState,
  daemonStore,
  logger,
  hubManager,
}: CreateHandlerContextOptions<MessageType>): HandlerContext<MessageType> {
  return {
    clientId: routeContext.clientId,
    daemonRunState,
    daemonStore,
    logger,
    hubManager,
    reply: routeContext.reply,
  };
}
