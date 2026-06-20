import type { UserModelMessage } from "ai";
import type {
  ContextUsage,
  ConversationRecord,
} from "./conversation-context.types";

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
    (record.contextUsage === undefined ||
      isContextUsage(record.contextUsage)) &&
    typeof record.finishReason === "string" &&
    (record.status === undefined ||
      record.status === "active" ||
      record.status === "superseded") &&
    (record.supersededBy === undefined ||
      typeof record.supersededBy === "string")
  );
}

/** Check the normalized context-usage object persisted on records. */
function isContextUsage(value: unknown): value is ContextUsage {
  if (typeof value !== "object" || value === null) return false;
  const contextUsage = value as Partial<ContextUsage>;
  return (
    typeof contextUsage.totalTokens === "number" &&
    (contextUsage.inputTokens === undefined ||
      typeof contextUsage.inputTokens === "number") &&
    (contextUsage.outputTokens === undefined ||
      typeof contextUsage.outputTokens === "number") &&
    (contextUsage.inputTokenDetails === undefined ||
      isInputTokenDetails(contextUsage.inputTokenDetails)) &&
    (contextUsage.outputTokenDetails === undefined ||
      isOutputTokenDetails(contextUsage.outputTokenDetails))
  );
}

function isInputTokenDetails(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const details = value as {
    readonly noCacheTokens?: unknown;
    readonly cacheReadTokens?: unknown;
    readonly cacheWriteTokens?: unknown;
  };
  return (
    (details.noCacheTokens === undefined ||
      typeof details.noCacheTokens === "number") &&
    (details.cacheReadTokens === undefined ||
      typeof details.cacheReadTokens === "number") &&
    (details.cacheWriteTokens === undefined ||
      typeof details.cacheWriteTokens === "number")
  );
}

function isOutputTokenDetails(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const details = value as {
    readonly textTokens?: unknown;
    readonly reasoningTokens?: unknown;
  };
  return (
    (details.textTokens === undefined ||
      typeof details.textTokens === "number") &&
    (details.reasoningTokens === undefined ||
      typeof details.reasoningTokens === "number")
  );
}
