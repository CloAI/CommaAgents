import type {
  BindingError,
  ChannelMessage,
  ChannelOpenResult,
} from "../../daemon-plugin/server";
import { bindingError } from "../messages/messages.utils";
import type {
  CreateSubscriptionOptions,
  Subscription,
} from "./subscriptions.types";

/**
 * Own channel setup, acknowledgement ordering, termination, and exactly-once cleanup.
 * @param {CreateSubscriptionOptions} options - Validated binding and connection delivery.
 * @returns {Subscription} Subscription setup and cleanup controls.
 * @internal
 */
export function createSubscription({
  requestId,
  channel,
  arguments: channelArguments,
  send,
  onClose,
}: CreateSubscriptionOptions): Subscription {
  const controller = new AbortController();
  const buffered: ChannelMessage[] = [];
  let phase: "opening" | "live" | "closed" = "opening";
  let result: void | ChannelOpenResult<ChannelMessage>;
  let ending: { readonly error?: BindingError } | undefined;
  let cleanup: Promise<void> | undefined;
  let closing = false;
  let unsubscribing = false;

  function release(): Promise<void> {
    if (!cleanup) {
      phase = "closed";
      controller.abort();
      buffered.length = 0;
      onClose();
      cleanup = Promise.resolve().then(() => result?.cleanup?.());
    }
    return cleanup;
  }

  async function finish(
    reason: "completed" | "failed" | "unsubscribed",
    error?: BindingError,
  ): Promise<void> {
    if (phase === "closed") {
      return;
    }
    try {
      await release();
    } catch (cleanupError) {
      reason = "failed";
      error = bindingError(cleanupError);
    }
    if (!closing) {
      send({
        type: "subscription_end",
        requestId,
        reason,
        ...(error ? { error } : {}),
      });
    }
  }

  const ready = Promise.resolve().then(async () => {
    try {
      result = await channel.open(channelArguments, {
        signal: controller.signal,
        send(message) {
          if (ending || controller.signal.aborted) {
            return;
          }
          if (phase === "opening") {
            buffered.push(message);
          } else if (phase === "live") {
            send({ ...message, requestId });
          }
        },
        end(error) {
          if (ending || controller.signal.aborted) {
            return;
          }
          ending = error ? { error } : {};
          controller.abort();
          if (phase === "live") {
            void finish(error ? "failed" : "completed", error);
          }
        },
      });
      if (closing) {
        await release();
        return;
      }
      send({ type: "response", requestId, ok: true, data: null });
      phase = "live";
      if (unsubscribing) {
        return;
      }
      if (result?.initial !== undefined) {
        send({ ...result.initial, requestId });
      }
      for (const message of buffered.splice(0)) {
        send({ ...message, requestId });
      }
      if (ending) {
        await finish(ending.error ? "failed" : "completed", ending.error);
      }
    } catch (error) {
      try {
        await release();
      } catch {
        // Preserve the setup failure when releasing partially acquired resources also fails.
      }
      if (!closing) {
        send({
          type: "response",
          requestId,
          ok: false,
          error: bindingError(error),
        });
      }
    }
  });

  return {
    ready,
    async unsubscribe() {
      unsubscribing = true;
      controller.abort();
      await ready;
      if (phase === "closed") {
        send({
          type: "response",
          requestId,
          ok: false,
          error: {
            code: "SUBSCRIPTION_NOT_FOUND",
            message: "Subscription has already ended",
          },
        });
        return;
      }
      send({ type: "response", requestId, ok: true, data: null });
      await finish("unsubscribed");
    },
    async close() {
      closing = true;
      controller.abort();
      await ready;
      await release();
    },
  };
}
