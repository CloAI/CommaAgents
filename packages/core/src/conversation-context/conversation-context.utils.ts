import type { UserModelMessage } from "ai";
import type { ConversationRecord } from "./conversation-context.types";

/** Wrap plain text in the AI SDK user-message shape. */
export function toUserMessage(
  text: string | UserModelMessage,
): UserModelMessage {
  if (typeof text === "string") {
    return { role: "user", content: text };
  }
  return text;
}

/** Check the minimal public record fields expected by the context contract. */
export function isConversationRecord(
  value: unknown,
): value is ConversationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ConversationRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.agentName === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.userMessage === "object" &&
    record.userMessage !== null &&
    Array.isArray(record.responseMessages) &&
    typeof record.text === "string" &&
    typeof record.usage === "object" &&
    record.usage !== null &&
    typeof record.usage.promptTokens === "number" &&
    typeof record.usage.completionTokens === "number" &&
    (record.contextTokens === undefined ||
      typeof record.contextTokens === "number") &&
    typeof record.finishReason === "string" &&
    (record.status === undefined ||
      record.status === "active" ||
      record.status === "superseded") &&
    (record.supersededBy === undefined ||
      typeof record.supersededBy === "string")
  );
}
