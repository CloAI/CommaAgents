import type { ModelMessage } from "ai";
import type {
  ConversationContext,
  ConversationContextOptions,
  ConversationRecord,
  CreateConversationRecordInput,
} from "./conversation-context.types";
import {
  isConversationRecord,
  toUserMessage,
} from "./conversation-context.utils";
import { prepareContextRecords } from "./retention";
import { activeRecords } from "./retention/retention.utils";

/**
 * Create a per-agent conversation context with import/export helpers for
 * the canonical conversation record contract.
 *
 * Optional retention settings run via `prepareForCall` before each call,
 * transforming the effective history non-destructively. The full record list
 * is always retained for export.
 *
 * @param options - Optional retention configuration.
 * @example
 * ```ts
 * const context = createConversationContext();
 * context.appendRecord(record);
 * const messages = context.messages();
 * ```
 */
export function createConversationContext(
  options?: ConversationContextOptions,
): ConversationContext {
  let conversationRecords: ConversationRecord[] = [];
  const contextOptions = options ?? {};

  function records(agentName?: string): readonly ConversationRecord[] {
    if (agentName === undefined) return conversationRecords;
    return conversationRecords.filter(
      (record) => record.agentName === agentName,
    );
  }

  return {
    get length() {
      return conversationRecords.length;
    },

    get isEmpty() {
      return conversationRecords.length === 0;
    },

    appendRecord(record: ConversationRecord): void {
      conversationRecords = [...conversationRecords, record];
    },

    records,

    messages(agentName?: string): readonly ModelMessage[] {
      return recordsToMessages(activeRecords(records(agentName)));
    },

    async prepareForCall(input: { agentName: string }): Promise<void> {
      conversationRecords = [
        ...(await prepareContextRecords(contextOptions, {
          records: conversationRecords,
          agentName: input.agentName,
        })),
      ];
    },

    importRecords(records: readonly ConversationRecord[]): void {
      conversationRecords = [...records];
    },

    exportRecords(): readonly ConversationRecord[] {
      return conversationRecords;
    },

    importJsonl(jsonl: string): void {
      conversationRecords = [...parseConversationJsonl(jsonl)];
    },

    exportJsonl(): string {
      return serializeConversationRecords(conversationRecords);
    },

    clear(): void {
      conversationRecords = [];
    },

    [Symbol.iterator](): Iterator<ConversationRecord> {
      return [...conversationRecords][Symbol.iterator]();
    },
  };
}

/**
 * Build a canonical conversation record from an agent call result.
 *
 * @param input - Agent call data used to construct the record.
 * @example
 * ```ts
 * const record = createConversationRecord({
 *   agentName: "assistant",
 *   userMessage: "Hello",
 *   responseMessages: result.responseMessages,
 *   text: result.text,
 *   usage: result.usage,
 *   finishReason: result.finishReason,
 * });
 * ```
 */
export function createConversationRecord(
  input: CreateConversationRecordInput,
): ConversationRecord {
  return {
    id: input.id ?? crypto.randomUUID(),
    agentName: input.agentName,
    createdAt: input.createdAt ?? new Date().toISOString(),
    userMessage: toUserMessage(input.userMessage),
    responseMessages: input.responseMessages,
    text: input.text,
    usage: input.usage,
    ...(input.contextTokens !== undefined
      ? { contextTokens: input.contextTokens }
      : {}),
    finishReason: input.finishReason,
  };
}

/**
 * Parse newline-delimited conversation records.
 *
 * @param jsonl - JSONL string containing one conversation record per line.
 * @example
 * ```ts
 * const records = parseConversationJsonl(savedContext);
 * ```
 */
export function parseConversationJsonl(
  jsonl: string,
): readonly ConversationRecord[] {
  const records: ConversationRecord[] = [];
  const lines = jsonl.split("\n");
  for (const [lineIndex, line] of lines.entries()) {
    if (line.trim().length === 0) continue;
    const parsedRecord = JSON.parse(line) as unknown;
    if (!isConversationRecord(parsedRecord)) {
      throw new Error(`Invalid conversation record on line ${lineIndex + 1}`);
    }
    records.push(parsedRecord);
  }
  return records;
}

/**
 * Serialize conversation records to newline-delimited JSON.
 *
 * @param records - Conversation records to serialize.
 * @example
 * ```ts
 * const jsonl = serializeConversationRecords(context.records());
 * ```
 */
export function serializeConversationRecords(
  records: readonly ConversationRecord[],
): string {
  if (records.length === 0) return "";
  return `${records.map(recordToJsonlLine).join("\n")}\n`;
}

/**
 * Serialize a single conversation record to one JSONL line.
 *
 * @param record - Conversation record to serialize.
 * @example
 * ```ts
 * const line = recordToJsonlLine(record);
 * ```
 */
export function recordToJsonlLine(record: ConversationRecord): string {
  return JSON.stringify(record);
}

/** Flatten conversation records into the AI SDK message array shape. */
export function recordsToMessages(
  records: readonly ConversationRecord[],
): readonly ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const record of records) {
    messages.push(record.userMessage);
    for (const responseMessage of record.responseMessages) {
      messages.push(responseMessage);
    }
  }
  return messages;
}

/** Return the combined input/output tokens from the final model step. */
export function contextTokensFromSteps(
  steps: readonly unknown[] | undefined,
): number | undefined {
  const lastStep = steps?.at(-1);
  if (typeof lastStep !== "object" || lastStep === null) return undefined;

  const usage = (lastStep as { readonly usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return undefined;

  const inputTokens = (usage as { readonly inputTokens?: unknown }).inputTokens;
  const outputTokens = (usage as { readonly outputTokens?: unknown })
    .outputTokens;
  if (typeof inputTokens !== "number" && typeof outputTokens !== "number") {
    return undefined;
  }

  return (
    (typeof inputTokens === "number" ? inputTokens : 0) +
    (typeof outputTokens === "number" ? outputTokens : 0)
  );
}
