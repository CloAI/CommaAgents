import type { PluginServer } from "../../daemon-plugin/server";
import type { MessageSender } from "../messages/messages.types";

/** @internal Resources for one connection-owned channel subscription. */
export interface Subscription {
  readonly ready: Promise<void>;
  unsubscribe(): Promise<void>;
  close(): Promise<void>;
}

/** @internal Validated channel setup and connection-specific delivery. */
export interface CreateSubscriptionOptions {
  readonly requestId: string;
  readonly channel: NonNullable<PluginServer["channels"]>[number];
  readonly arguments: unknown;
  readonly send: MessageSender;
  readonly onClose: () => void;
}
