// Client → Daemon message types — barrel + discriminated union.

import { z } from "zod";

export { ListFlowsMessage } from "./list-flows";
export { PingMessage } from "./ping";
export { ProvideAuthMessage } from "./provide-auth";
export { StartFlowMessage } from "./start-flow";
export { StopFlowMessage } from "./stop-flow";
export { SubscribeMessage } from "./subscribe";
export { UnsubscribeMessage } from "./unsubscribe";
export { UserInputMessage } from "./user-input";

import { ListFlowsMessage } from "./list-flows";
import { PingMessage } from "./ping";
import { ProvideAuthMessage } from "./provide-auth";
import { StartFlowMessage } from "./start-flow";
import { StopFlowMessage } from "./stop-flow";
import { SubscribeMessage } from "./subscribe";
import { UnsubscribeMessage } from "./unsubscribe";
import { UserInputMessage } from "./user-input";

// ---------------------------------------------------------------------------
// Discriminated union of all client → daemon messages
// ---------------------------------------------------------------------------

export const ClientMessage = z.discriminatedUnion("type", [
  StartFlowMessage,
  StopFlowMessage,
  UserInputMessage,
  ProvideAuthMessage,
  ListFlowsMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------------------------------------------------------------------------
// Parse helper — validates raw JSON from the WebSocket
// ---------------------------------------------------------------------------

/**
 * Safely parse an unknown value as a ClientMessage.
 * Returns a Zod SafeParseResult.
 */
export function parseClientMessage(raw: unknown) {
  return ClientMessage.safeParse(raw);
}
