import { z } from "zod";
import { privacyError } from "../../privacy/privacy.utils";
import { decryptVeniceChunk } from "./venice.crypto";

const toolDeltaSchema = z
  .object({
    index: z.number().int().nonnegative(),
    id: z.string().min(1).max(1024).optional(),
    type: z.literal("function").optional(),
    function: z
      .object({ name: z.string().optional(), arguments: z.string().optional() })
      .strict()
      .optional(),
  })
  .strict();
const deltaSchema = z
  .object({
    role: z.literal("assistant").optional(),
    content: z.string().nullable().optional(),
    reasoning_content: z.string().nullable().optional(),
    refusal: z.string().nullable().optional(),
    tool_calls: z.array(toolDeltaSchema).optional(),
  })
  .passthrough();
const chunkSchema = z
  .object({
    id: z.string().min(1).max(1024).optional(),
    model: z.string().min(1).max(1024).optional(),
    object: z.literal("chat.completion.chunk").optional(),
    created: z.number().int().nonnegative().optional(),
    choices: z
      .array(
        z
          .object({
            index: z.literal(0),
            delta: deltaSchema,
            finish_reason: z
              .enum(["stop", "length", "tool_calls", "content_filter"])
              .nullable()
              .optional(),
            logprobs: z.unknown().optional(),
          })
          .passthrough(),
      )
      .max(1),
    usage: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();

/** Validated tools reconstructed from ordinary TEE chat deltas. */
export interface VeniceCompletionToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
}

/** Chat response reconstructed only after the entire upstream stream is present. */
export interface VeniceBufferedCompletion {
  readonly id: string;
  readonly object: "chat.completion";
  readonly created: number;
  readonly model: string;
  readonly choices: readonly [
    {
      readonly index: 0;
      readonly message: {
        readonly role: "assistant";
        readonly content: string | null;
        readonly reasoning_content?: string;
        readonly refusal?: string;
        readonly tool_calls?: readonly VeniceCompletionToolCall[];
      };
      readonly finish_reason: string;
    },
  ];
  readonly usage?: Readonly<Record<string, unknown>>;
}

/** Local decryption key and maximum aggregate decoded content size. */
export interface VeniceStreamOptions {
  readonly privateKey?: Uint8Array;
  readonly maxPlaintextBytes: number;
}

/** Buffered stream representation; callers must authenticate it before releasing any field. */
export interface VeniceStreamResult {
  readonly body: string;
  readonly completion: VeniceBufferedCompletion;
  readonly content: string;
  readonly reasoning: string;
  readonly completionId: string;
  readonly modelId: string;
}

/** Validate and optionally decrypt complete SSE frames without trusting plaintext fallbacks.
 * @param {Uint8Array} wire - Complete upstream SSE response bytes.
 * @param {VeniceStreamOptions} options - Request key and decoded-content budget.
 * @returns {VeniceStreamResult} Buffered data requiring completion authentication before release.
 */
export function parseVeniceStream(
  wire: Uint8Array,
  { privateKey, maxPlaintextBytes }: VeniceStreamOptions,
): VeniceStreamResult {
  if (!Number.isSafeInteger(maxPlaintextBytes) || maxPlaintextBytes <= 0)
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(wire);
  } catch {
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  }
  source = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!source.endsWith("\n\n")) throw privacyError("PRIVACY_INVALID_RESPONSE");
  let completionId = "";
  let modelId = "";
  let created = 0;
  let content = "";
  let reasoning = "";
  let refusal = "";
  let finishReason = "";
  let finished = false;
  let done = false;
  let plaintextBytes = 0;
  let usage: Record<string, unknown> | undefined;
  const tools = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  const frames: string[] = [];

  for (const frame of source.split("\n\n")) {
    if (!frame) continue;
    const lines = frame.split("\n");
    const dataLines = lines.filter(
      (line) => line === "data" || line.startsWith("data:"),
    );
    if (dataLines.length === 0) {
      frames.push(frame);
      continue;
    }
    if (done) throw privacyError("PRIVACY_INVALID_RESPONSE");
    if (lines.some((line) => /^event:\s*error\s*$/.test(line)))
      throw privacyError("PRIVACY_PROVIDER_ERROR");
    const data = dataLines
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data === "[DONE]") {
      if (!finished) throw privacyError("PRIVACY_INVALID_RESPONSE");
      done = true;
      frames.push(frame);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(data) as unknown;
    } catch {
      throw privacyError("PRIVACY_INVALID_RESPONSE");
    }
    if (typeof value === "object" && value !== null && "error" in value)
      throw privacyError("PRIVACY_PROVIDER_ERROR");
    const parsed = chunkSchema.safeParse(value);
    if (!parsed.success) throw privacyError("PRIVACY_INVALID_RESPONSE");
    const chunk = parsed.data;
    if (chunk.id) {
      if (completionId && completionId !== chunk.id)
        throw privacyError("PRIVACY_INVALID_RESPONSE");
      completionId = chunk.id;
    }
    if (chunk.model) {
      if (modelId && modelId !== chunk.model)
        throw privacyError("PRIVACY_INVALID_RESPONSE");
      modelId = chunk.model;
    }
    if (chunk.created !== undefined) created = chunk.created;
    if (privateKey) {
      const rootFields = new Set([
        "id",
        "model",
        "object",
        "created",
        "choices",
        "usage",
        "system_fingerprint",
        "service_tier",
      ]);
      if (Object.keys(chunk).some((key) => !rootFields.has(key)))
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
      if (chunk.usage && !validUsage(chunk.usage))
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
      for (const key of ["system_fingerprint", "service_tier"])
        if (chunk[key] != null && typeof chunk[key] !== "string")
          throw privacyError("PRIVACY_INVALID_RESPONSE");
    }
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices) {
      const delta = choice.delta;
      const supportedDeltaFields = new Set([
        "role",
        "content",
        "reasoning_content",
        "refusal",
        "tool_calls",
      ]);
      if (Object.keys(delta).some((key) => !supportedDeltaFields.has(key)))
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
      if (privateKey) {
        const choiceFields = new Set([
          "index",
          "delta",
          "finish_reason",
          "logprobs",
        ]);
        const deltaFields = new Set(["role", "content", "reasoning_content"]);
        if (
          Object.keys(choice).some((key) => !choiceFields.has(key)) ||
          Object.keys(delta).some((key) => !deltaFields.has(key)) ||
          choice.logprobs != null
        )
          throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
      }
      if (
        finished &&
        (choice.finish_reason != null ||
          Object.values(delta).some((value) => value != null && value !== ""))
      )
        throw privacyError("PRIVACY_INVALID_RESPONSE");
      for (const field of [
        "content",
        "reasoning_content",
        "refusal",
      ] as const) {
        const rawContent = delta[field];
        if (!rawContent) continue;
        const decoded = privateKey
          ? decryptVeniceChunk(rawContent, privateKey)
          : rawContent;
        plaintextBytes += Buffer.byteLength(decoded, "utf8");
        if (plaintextBytes > maxPlaintextBytes)
          throw privacyError("PRIVACY_LIMIT_EXCEEDED");
        delta[field] = decoded;
        if (field === "content") content += decoded;
        else if (field === "reasoning_content") reasoning += decoded;
        else refusal += decoded;
      }
      if ("function_call" in delta)
        throw privacyError("PRIVACY_UNSUPPORTED_FEATURE");
      for (const tool of delta.tool_calls ?? []) {
        const current = tools.get(tool.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        if (tool.id) {
          if (current.id && current.id !== tool.id)
            throw privacyError("PRIVACY_INVALID_RESPONSE");
          current.id = tool.id;
        }
        current.name += tool.function?.name ?? "";
        current.arguments += tool.function?.arguments ?? "";
        plaintextBytes += Buffer.byteLength(
          (tool.function?.name ?? "") + (tool.function?.arguments ?? ""),
          "utf8",
        );
        if (plaintextBytes > maxPlaintextBytes)
          throw privacyError("PRIVACY_LIMIT_EXCEEDED");
        tools.set(tool.index, current);
      }
      if (choice.finish_reason != null) {
        finished = true;
        finishReason = choice.finish_reason;
      }
    }
    let replaced = false;
    frames.push(
      lines
        .flatMap((line) => {
          if (line !== "data" && !line.startsWith("data:")) return [line];
          if (replaced) return [];
          replaced = true;
          return [`data: ${JSON.stringify(chunk)}`];
        })
        .join("\n"),
    );
  }
  if (!done || !finished || !completionId || !modelId)
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  const toolCalls: VeniceCompletionToolCall[] = [];
  for (const [toolIndex, tool] of [...tools].sort(
    ([left], [right]) => left - right,
  )) {
    if (toolIndex !== toolCalls.length || !tool.id || !tool.name)
      throw privacyError("PRIVACY_INVALID_RESPONSE");
    try {
      JSON.parse(tool.arguments);
    } catch {
      throw privacyError("PRIVACY_INVALID_RESPONSE");
    }
    toolCalls.push({
      id: tool.id,
      type: "function",
      function: { name: tool.name, arguments: tool.arguments },
    });
  }
  if ((finishReason === "tool_calls") !== toolCalls.length > 0)
    throw privacyError("PRIVACY_INVALID_RESPONSE");
  return {
    body: `${frames.join("\n\n")}\n\n`,
    completion: {
      id: completionId,
      object: "chat.completion",
      created,
      model: modelId,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: content || (toolCalls.length ? null : ""),
            ...(reasoning ? { reasoning_content: reasoning } : {}),
            ...(refusal ? { refusal } : {}),
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: finishReason,
        },
      ],
      ...(usage ? { usage } : {}),
    },
    content,
    reasoning,
    completionId,
    modelId,
  };
}

/** Accept numeric token accounting only on encrypted responses.
 * @param {Record<string, unknown>} usage - Upstream token accounting.
 * @returns {boolean} Whether accounting contains numeric data only.
 */
function validUsage(usage: Record<string, unknown>): boolean {
  return Object.values(usage).every(
    (value) =>
      value === null ||
      (typeof value === "number" && Number.isFinite(value) && value >= 0) ||
      (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every(
          (detail) =>
            typeof detail === "number" &&
            Number.isFinite(detail) &&
            detail >= 0,
        )),
  );
}
