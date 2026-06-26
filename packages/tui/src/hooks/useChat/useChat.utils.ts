import { parseMcpToolName } from "@comma-agents/core";
import type {
  ChatMessage,
  ChatRun,
  ChatRunId,
  CreateRunInit,
  PersistedConversationInput,
  PersistedConversationRecord,
  PersistedConversationRetentionEvent,
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
    mcpServers: [],
    pendingMcpConfirmation: false,
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

/** Create an opaque id for a TUI-local chat message. */
export function createLocalChatMessageId(chatRunId: ChatRunId): string {
  return `${chatRunId}-local-${crypto.randomUUID()}`;
}

/**
 * Project daemon conversation records into chat messages for display.
 *
 * Human inputs come from `inputs` (the genuine run-start / continuation
 * prompts), each anchored before the first agent record of its segment. A
 * record's own `userMessage` is the input fed *into* that agent — which for a
 * downstream agent is the upstream agent's output — so it is intentionally not
 * rendered, to mirror the live (non-rehydrated) transcript and avoid duplicate,
 * mislabeled bubbles.
 */
export function conversationRecordsToChatMessages(
  chatRunId: ChatRunId,
  records: readonly PersistedConversationRecord[],
  retentionEvents: readonly PersistedConversationRetentionEvent[] = [],
  inputs: readonly PersistedConversationInput[] = [],
): readonly ChatMessage[] {
  const messages: ChatMessage[] = [];
  const retentionEventsBySummaryId = new Map(
    retentionEvents.map((event) => [event.summaryRecord.id, event]),
  );
  const renderedRetentionEventIds = new Set<string>();

  const inputsByRecordId = new Map<string, string[]>();
  const trailingInputs: string[] = [];
  inputs.forEach((input) => {
    if (input.beforeRecordId === undefined) {
      trailingInputs.push(input.text);
      return;
    }
    const existing = inputsByRecordId.get(input.beforeRecordId) ?? [];
    existing.push(input.text);
    inputsByRecordId.set(input.beforeRecordId, existing);
  });

  let humanInputCounter = 0;
  const pushHumanInput = (text: string, timestamp: number): void => {
    messages.push({
      id: `${chatRunId}-input-${humanInputCounter}`,
      role: "user",
      sender: "you",
      text,
      streaming: false,
      timestamp,
    });
    humanInputCounter += 1;
  };

  for (const record of records) {
    const timestamp = parseRecordTimestamp(record.createdAt);

    for (const text of inputsByRecordId.get(record.id) ?? []) {
      pushHumanInput(text, timestamp);
    }

    const retentionEvent = retentionEventsBySummaryId.get(record.id);
    if (retentionEvent !== undefined) {
      messages.push({
        id: `${chatRunId}-retention-${retentionEvent.id}`,
        role: "agent",
        sender: retentionEvent.agentName,
        text: "",
        segments: [{ type: "retention", event: retentionEvent }],
        streaming: false,
        completedAt: timestamp,
        timestamp,
      });
      renderedRetentionEventIds.add(retentionEvent.id);
      continue;
    }

    messages.push({
      id: `${chatRunId}-record-${record.id}-agent`,
      role: "agent",
      sender: record.agentName,
      text: record.text,
      segments: conversationRecordSegments(record),
      streaming: false,
      usage: record.usage,
      ...(record.contextUsage !== undefined
        ? { contextUsage: record.contextUsage }
        : {}),
      completedAt: timestamp,
      timestamp,
    });
  }

  for (const text of trailingInputs) {
    pushHumanInput(text, Date.now());
  }

  for (const retentionEvent of retentionEvents) {
    if (renderedRetentionEventIds.has(retentionEvent.id)) continue;
    const timestamp = parseRecordTimestamp(retentionEvent.createdAt);
    messages.push({
      id: `${chatRunId}-retention-${retentionEvent.id}`,
      role: "agent",
      sender: retentionEvent.agentName,
      text: "",
      segments: [{ type: "retention", event: retentionEvent }],
      streaming: false,
      completedAt: timestamp,
      timestamp,
    });
  }

  return messages;
}

function conversationRecordSegments(
  record: PersistedConversationRecord,
): NonNullable<ChatMessage["segments"]> {
  const segments: NonNullable<ChatMessage["segments"]>[number][] = [];
  if (record.text.length > 0) {
    segments.push({ type: "text", text: record.text, streaming: false });
  }

  for (const responseMessage of record.responseMessages) {
    if (!Array.isArray(responseMessage.content)) continue;
    for (const rawPart of responseMessage.content) {
      if (typeof rawPart !== "object" || rawPart === null) continue;
      const part = rawPart as Record<string, unknown>;
      if (
        part.type === "tool-call" &&
        typeof part.toolCallId === "string" &&
        typeof part.toolName === "string"
      ) {
        const mcp = parseMcpToolName(part.toolName);
        segments.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: stringifyToolValue(part.input ?? part.args),
          ...(mcp ? { mcp } : {}),
        });
      } else if (
        part.type === "tool-result" &&
        typeof part.toolCallId === "string" &&
        typeof part.toolName === "string"
      ) {
        const mcp = parseMcpToolName(part.toolName);
        segments.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: stringifyToolValue(part.output),
          status: "completed",
          ...(mcp ? { mcp } : {}),
        });
      }
    }
  }

  return segments;
}

function stringifyToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Parse a record timestamp, falling back to the current clock if invalid. */
function parseRecordTimestamp(createdAt: string): number {
  const timestamp = Date.parse(createdAt);
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}
