import { ClientMessageSchema, ServerMessageSchema } from "../messages";
import { bindingError } from "../messages/messages.utils";
import type { MessageSender } from "../messages/messages.types";
import { createSubscription } from "../subscriptions";
import type { Subscription } from "../subscriptions/subscriptions.types";
import type { Connection, CreateConnectionOptions } from "./connections.types";

/**
 * Route validated requests and isolate each client's subscriptions from daemon work.
 * @param {CreateConnectionOptions} options - Registry and socket operations.
 * @returns {Connection} Request routing and subscription cleanup.
 * @internal
 */
export function createConnection({
  registry,
  send,
  close,
}: CreateConnectionOptions): Connection {
  const requests = new Set<string>();
  const subscriptions = new Map<string, Subscription>();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  function dispose(): Promise<void> {
    if (!disposal) {
      disposed = true;
      disposal = Promise.allSettled(
        [...subscriptions.values()].map((subscription) => subscription.close()),
      ).then(() => {
        subscriptions.clear();
      });
    }
    return disposal;
  }

  const deliver: MessageSender = (message) => {
    if (disposed) {
      return;
    }
    try {
      const encoded = JSON.stringify({
        ...message,
        ts: new Date().toISOString(),
      });
      ServerMessageSchema.parse(JSON.parse(encoded));
      send(encoded);
    } catch {
      close(1011, "Invalid outgoing message");
      void dispose();
    }
  };

  return {
    dispose,
    async receive(rawMessage) {
      if (disposed) {
        return;
      }
      let incoming: unknown;
      try {
        incoming = JSON.parse(rawMessage);
      } catch {
        close(1008, "Invalid JSON");
        await dispose();
        return;
      }
      const parsed = ClientMessageSchema.safeParse(incoming);
      if (!parsed.success) {
        close(1008, "Invalid request envelope");
        await dispose();
        return;
      }
      const request = parsed.data;
      if (request.type === "unsubscribe") {
        const subscription = subscriptions.get(request.requestId);
        if (!subscription) {
          deliver({
            type: "response",
            requestId: request.requestId,
            ok: false,
            error: {
              code: "SUBSCRIPTION_NOT_FOUND",
              message: "No subscription for this requestId",
            },
          });
          return;
        }
        await subscription.unsubscribe();
        return;
      }
      if (
        requests.has(request.requestId) ||
        subscriptions.has(request.requestId)
      ) {
        close(1008, "Duplicate active requestId");
        await dispose();
        return;
      }
      const binding =
        request.type === "command"
          ? registry.commands.get(request.command)
          : registry.channels.get(request.channel);
      if (!binding) {
        deliver({
          type: "response",
          requestId: request.requestId,
          ok: false,
          error: {
            code: "UNKNOWN_BINDING",
            message: "Unknown command or channel",
          },
        });
        return;
      }
      if (!binding.arguments.safeParse(request.arguments).success) {
        close(1008, "Invalid binding arguments");
        await dispose();
        return;
      }
      if (request.type === "subscribe") {
        const channel = registry.channels.get(request.channel)!;
        const subscription = createSubscription({
          requestId: request.requestId,
          channel,
          arguments: request.arguments,
          send: deliver,
          onClose() {
            subscriptions.delete(request.requestId);
          },
        });
        subscriptions.set(request.requestId, subscription);
        await subscription.ready;
        return;
      }
      requests.add(request.requestId);
      try {
        const data = await registry.commands
          .get(request.command)!
          .invoke(request.arguments);
        deliver({
          type: "response",
          requestId: request.requestId,
          ok: true,
          data,
        });
      } catch (error) {
        deliver({
          type: "response",
          requestId: request.requestId,
          ok: false,
          error: bindingError(error),
        });
      } finally {
        requests.delete(request.requestId);
      }
    },
  };
}
