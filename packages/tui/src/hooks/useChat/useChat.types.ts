/** Sender role for display purposes. */
export type MessageRole = "user" | "agent" | "system";

/** A single message in the chat log. */
export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  /** Agent name (or "you" for user, "system" for system messages). */
  readonly sender: string;
  /** Full accumulated text. Grows during streaming. */
  readonly text: string;
  /** Whether this message is still receiving streaming tokens. */
  readonly streaming: boolean;
  readonly timestamp: number;
}

/** Chat connection state exposed by the useChat hook. */
export type ChatStatus =
  | "idle"
  | "picking"
  | "connecting"
  | "running"
  | "waiting_input"
  | "done"
  | "error";

/**
 * Configuration for the useChat hook.
 *
 * The daemon URL is configured on the `<DaemonProvider>`, not here.
 * This config is reserved for future per-chat options.
 */
// biome-ignore lint/suspicious/noEmptyInterface: placeholder for future options
export interface UseChatConfig {}
