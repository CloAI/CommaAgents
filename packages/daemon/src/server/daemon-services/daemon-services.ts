import { getLogger } from "@logtape/logtape";
import type { DaemonMessage } from "../protocol/messages";
import { parseClientMessage } from "../protocol/messages";
import type {
  ClientMessageType,
  DaemonRoute,
  DaemonRouteContext,
  DaemonRouteHandler,
  DaemonServiceRegistry,
  DaemonServiceRegistryConfig,
} from "./daemon-services.types";

const logger = getLogger(["comma", "daemon", "daemon-services"]);

function buildErrorMessage(
  code: string,
  message: string,
  requestId?: string,
): DaemonMessage {
  return {
    type: "error",
    code,
    message,
    ts: new Date().toISOString(),
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

/**
 * Define a request-specific route while preserving its response mapping.
 *
 * @param {MessageType} type - Client message discriminant handled by the route.
 * @param {DaemonRouteHandler<MessageType>} handler - Strongly typed handler for the selected request.
 * @returns {DaemonRoute} A type-erased route suitable for heterogeneous registration.
 * @internal
 *
 * @example
 * ```ts
 * const route = defineDaemonRoute("ping", (message, context) => {
 *   context.reply({ type: "pong", ts: new Date().toISOString(), requestId: message.requestId });
 * });
 * ```
 */
export function defineDaemonRoute<MessageType extends ClientMessageType>(
  type: MessageType,
  handler: DaemonRouteHandler<MessageType>,
): DaemonRoute {
  return {
    type,
    handle(message, context): Promise<void> | void {
      return handler(
        message as Extract<typeof message, { readonly type: MessageType }>,
        context as DaemonRouteContext<MessageType>,
      );
    },
  };
}

/**
 * Create the daemon's centralized inbound service registry.
 *
 * @param {DaemonServiceRegistryConfig} config - Services and outbound protocol delivery.
 * @returns {DaemonServiceRegistry} A registry that parses and routes raw client frames.
 * @throws When two services register the same client message type.
 * @internal
 *
 * @example
 * ```ts
 * const registry = createDaemonServiceRegistry({ services, messageSender });
 * await registry.handleMessage(clientId, rawFrame);
 * ```
 */
export function createDaemonServiceRegistry({
  services,
  messageSender,
}: DaemonServiceRegistryConfig): DaemonServiceRegistry {
  const routesByType = new Map<ClientMessageType, DaemonRoute>();

  for (const service of services) {
    for (const route of service.routes) {
      if (routesByType.has(route.type)) {
        throw new Error(`Duplicate daemon route: ${route.type}`);
      }
      routesByType.set(route.type, route);
    }
  }

  return {
    async handleMessage(clientId, rawMessage): Promise<void> {
      let parsedJson: unknown;
      try {
        const messageText =
          typeof rawMessage === "string"
            ? rawMessage
            : rawMessage.toString("utf-8");
        parsedJson = JSON.parse(messageText);
      } catch {
        messageSender.send(
          clientId,
          buildErrorMessage("PARSE_ERROR", "Invalid JSON"),
        );
        return;
      }

      const parsedMessage = parseClientMessage(parsedJson);
      if (!parsedMessage.success) {
        const details = parsedMessage.error.errors
          .map(
            (validationError) =>
              `${validationError.path.join(".")}: ${validationError.message}`,
          )
          .join("; ");
        const requestId =
          typeof parsedJson === "object" && parsedJson !== null
            ? (parsedJson as Record<string, unknown>).requestId
            : undefined;
        messageSender.send(
          clientId,
          buildErrorMessage(
            "VALIDATION_ERROR",
            `Invalid message: ${details}`,
            typeof requestId === "string" ? requestId : undefined,
          ),
        );
        return;
      }

      const message = parsedMessage.data;
      const route = routesByType.get(message.type);
      if (!route) {
        messageSender.send(
          clientId,
          buildErrorMessage("INTERNAL_ERROR", `No route for ${message.type}`),
        );
        return;
      }

      logger.debug(
        `route ${message.type}${
          message.requestId ? ` (requestId=${message.requestId})` : ""
        } from ${clientId}`,
      );

      try {
        await route.handle(message, {
          clientId,
          requestId: message.requestId,
          reply(response): void {
            messageSender.send(clientId, response);
          },
        });
      } catch (error: unknown) {
        logger.error(`Message handler error: ${String(error)}`);
        messageSender.send(
          clientId,
          buildErrorMessage(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : String(error),
            message.requestId,
          ),
        );
      }
    },
  };
}
