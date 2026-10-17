import type { z } from "zod";
import type {
  ClientMessageSchema,
  ServerMessageSchema,
} from "./messages.schemas";

/** Values supported by the WebSocket JSON protocol. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
/** Validated client command or subscription operation. */
export type PluginClientMessage = z.infer<typeof ClientMessageSchema>;
/** Validated server response, channel event, or channel completion. */
export type PluginServerMessage = z.infer<typeof ServerMessageSchema>;
/** @internal Adds timestamps and validates outgoing JSON at the socket boundary. */
export type MessageSender = (message: {
  readonly type: "response" | "event" | "subscription_end";
  readonly requestId: string;
  readonly ok?: boolean;
  readonly data?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
  readonly reason?: "completed" | "failed" | "unsubscribed";
}) => void;
