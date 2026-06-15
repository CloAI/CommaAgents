import type { ChatRunId } from "../useChat.types";

export interface ChatPermissionRequestResult {
  readonly sendPermissionDecision: (
    chatRunId: ChatRunId,
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
}
