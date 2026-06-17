import type {
  ChatMessage,
  ChatRun,
  ChatRunId,
  CreateRunInit,
  PersistedConversationRecord,
} from "./useChat.types";

function deriveLabelFromPath(strategyPath: string): string {
  const segments = strategyPath.split("/");
  const fileName = segments[segments.length - 1] ?? strategyPath;
  return fileName.replace(/\.(json|yaml|yml)$/u, "");
}

/** Construct a fresh local chat run in the idle state. */
export function createInitialChatRun(
  chatRunId: ChatRunId,
  init: CreateRunInit,
): ChatRun {
  const now = Date.now();
  return {
    id: chatRunId,
    daemonRunId: null,
    label:
      init.label ??
      (init.strategyPath ? deriveLabelFromPath(init.strategyPath) : "New run"),
    strategyPath: init.strategyPath ?? null,
    strategyName: null,
    status: "idle",
    runStatus: null,
    error: null,
    pendingExecution: null,
    pendingInputAgent: null,
    pendingPermissionRequests: [],
    pendingQuestionRequests: [],
    messages: [],
    activeLaunchStrategyIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Return the innermost active spawned-strategy tool-call id for a run. */
export function getActiveLaunchStrategyId(
  chatRun: ChatRun,
): string | undefined {
  return chatRun.activeLaunchStrategyIds[
    chatRun.activeLaunchStrategyIds.length - 1
  ];
}

/** Project daemon conversation records into chat messages for display. */
export function conversationRecordsToChatMessages(
  chatRunId: ChatRunId,
  records: readonly PersistedConversationRecord[],
): readonly ChatMessage[] {
  const messages: ChatMessage[] = [];
  let messageIndex = 0;

  for (const record of records) {
    const timestamp = parseRecordTimestamp(record.createdAt);
    messageIndex += 1;
    messages.push({
      id: `${chatRunId}-msg-${messageIndex}`,
      role: "user",
      sender: "you",
      text: contentToText(record.userMessage.content),
      streaming: false,
      timestamp,
    });

    messageIndex += 1;
    messages.push({
      id: `${chatRunId}-msg-${messageIndex}`,
      role: "agent",
      sender: record.agentName,
      text: record.text,
      segments: [{ type: "text", text: record.text, streaming: false }],
      streaming: false,
      usage: record.usage,
      ...(record.contextTokens !== undefined
        ? { contextTokens: record.contextTokens }
        : {}),
      completedAt: timestamp,
      timestamp,
    });
  }

  return messages;
}

/** Parse a record timestamp, falling back to the current clock if invalid. */
function parseRecordTimestamp(createdAt: string): number {
  const timestamp = Date.parse(createdAt);
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

/** Convert AI SDK message content into display text. */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const textParts: string[] = [];
  for (const contentPart of content) {
    if (
      typeof contentPart === "object" &&
      contentPart !== null &&
      "text" in contentPart &&
      typeof contentPart.text === "string"
    ) {
      textParts.push(contentPart.text);
    }
  }
  return textParts.join("");
}
