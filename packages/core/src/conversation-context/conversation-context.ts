import type { ModelMessage } from "ai";
import YAML from "yaml";
import type {
  ContextUsage,
  ConversationContext,
  ConversationContextOptions,
  ConversationRecord,
  ConversationRetentionEvent,
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

    async prepareForCall(
      input: Parameters<ConversationContext["prepareForCall"]>[0],
    ): Promise<readonly ConversationRetentionEvent[]> {
      const result = await prepareContextRecords(contextOptions, {
        records: conversationRecords,
        ...input,
      });
      conversationRecords = [...result.records];
      return result.events;
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

    importJson(json: string): void {
      conversationRecords = [...parseConversationJson(json)];
    },

    exportJson(): string {
      return serializeConversationRecordsJson(conversationRecords);
    },

    importYaml(yaml: string): void {
      conversationRecords = [...parseConversationYaml(yaml)];
    },

    exportYaml(): string {
      return serializeConversationRecordsYaml(conversationRecords);
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
    ...(input.contextUsage !== undefined
      ? { contextUsage: input.contextUsage }
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

/** Parse a JSON array of canonical conversation records. */
export function parseConversationJson(
  json: string,
): readonly ConversationRecord[] {
  return parseConversationRecordArray(JSON.parse(json));
}

/** Serialize conversation records as pretty JSON. */
export function serializeConversationRecordsJson(
  records: readonly ConversationRecord[],
): string {
  return `${JSON.stringify(records, null, 2)}\n`;
}

/** Parse YAML containing an array of canonical conversation records. */
export function parseConversationYaml(
  yaml: string,
): readonly ConversationRecord[] {
  return parseConversationRecordArray(YAML.parse(yaml));
}

/** Serialize conversation records as YAML. */
export function serializeConversationRecordsYaml(
  records: readonly ConversationRecord[],
): string {
  return YAML.stringify(records);
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

function parseConversationRecordArray(
  value: unknown,
): readonly ConversationRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Conversation data must be an array of records");
  }

  return value.map((parsedRecord, recordIndex) => {
    if (!isConversationRecord(parsedRecord)) {
      throw new Error(`Invalid conversation record at index ${recordIndex}`);
    }
    return parsedRecord;
  });
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

/** Return normalized context usage from the final model step. */
export function contextUsageFromSteps(
  steps: readonly unknown[] | undefined,
): ContextUsage | undefined {
  const lastStep = steps?.at(-1);
  if (typeof lastStep !== "object" || lastStep === null) return undefined;

  const usage = (lastStep as { readonly usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return undefined;

  const usageRecord = usage as Readonly<Record<string, unknown>>;
  const inputTokens = readTokenTotal(usageRecord.inputTokens);
  const outputTokens = readTokenTotal(usageRecord.outputTokens);
  const totalTokens =
    readNumber(usageRecord.totalTokens) ??
    (inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);
  if (totalTokens === undefined) {
    return undefined;
  }

  const contextUsage: ContextUsage = {
    totalTokens,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...inputTokenDetailsFromUsage(usageRecord),
    ...outputTokenDetailsFromUsage(usageRecord),
  };
  return contextUsage;
}

function inputTokenDetailsFromUsage(
  usageRecord: Readonly<Record<string, unknown>>,
): Pick<ContextUsage, "inputTokenDetails"> {
  const flatDetails = objectRecord(usageRecord.inputTokenDetails);
  const nestedDetails = objectRecord(usageRecord.inputTokens);
  const noCacheTokens =
    readNumber(flatDetails?.noCacheTokens) ??
    readNumber(nestedDetails?.noCache);
  const cacheReadTokens =
    readNumber(flatDetails?.cacheReadTokens) ??
    readNumber(nestedDetails?.cacheRead);
  const cacheWriteTokens =
    readNumber(flatDetails?.cacheWriteTokens) ??
    readNumber(nestedDetails?.cacheWrite);
  if (
    noCacheTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return {};
  }

  return {
    inputTokenDetails: {
      ...(noCacheTokens !== undefined ? { noCacheTokens } : {}),
      ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
      ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    },
  };
}

function outputTokenDetailsFromUsage(
  usageRecord: Readonly<Record<string, unknown>>,
): Pick<ContextUsage, "outputTokenDetails"> {
  const flatDetails = objectRecord(usageRecord.outputTokenDetails);
  const nestedDetails = objectRecord(usageRecord.outputTokens);
  const textTokens =
    readNumber(flatDetails?.textTokens) ?? readNumber(nestedDetails?.text);
  const reasoningTokens =
    readNumber(flatDetails?.reasoningTokens) ??
    readNumber(usageRecord.reasoningTokens) ??
    readNumber(nestedDetails?.reasoning);
  if (textTokens === undefined && reasoningTokens === undefined) {
    return {};
  }

  return {
    outputTokenDetails: {
      ...(textTokens !== undefined ? { textTokens } : {}),
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    },
  };
}

function readTokenTotal(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  return readNumber(objectRecord(value)?.total);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return value as Readonly<Record<string, unknown>>;
}
