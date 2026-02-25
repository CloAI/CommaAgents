/**
 * Enhanced mock LanguageModel for E2E tests.
 *
 * Unlike the simple mock model in unit tests (which only returns text),
 * this mock supports multi-step tool calling — the core agentic workflow.
 *
 * The model accepts a sequence of "rounds". Each round defines what the
 * model returns for that doGenerate/doStream call:
 *   - `{ text: "..." }` — return a text response (finish reason: "stop")
 *   - `{ toolCalls: [...] }` — return tool call requests (finish reason: "tool-calls")
 *
 * The AI SDK's generateText/streamText will call the model multiple times
 * when tool calls are involved (call model → execute tools → call model again
 * with tool results). Each invocation consumes the next round.
 *
 * @example
 * ```ts
 * const model = createToolCallingMockModel({
 *   rounds: [
 *     // Round 1: model requests a tool call
 *     { toolCalls: [{ id: "call-1", name: "weather", args: { city: "Tokyo" } }] },
 *     // Round 2: model receives tool result and returns final text
 *     { text: "The weather in Tokyo is 18°C" },
 *   ],
 * });
 * ```
 */

import type { LanguageModel } from "ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A round where the model returns a text response. */
export interface TextRound {
  readonly text: string;
}

/** A single tool call request from the model. */
export interface MockToolCall {
  /** Unique call ID (e.g., "call-1"). The AI SDK uses this to correlate results. */
  readonly id: string;
  /** Tool name to call. */
  readonly name: string;
  /** Arguments to pass to the tool. */
  readonly args: Record<string, unknown>;
}

/** A round where the model requests tool calls. */
export interface ToolCallRound {
  readonly toolCalls: readonly MockToolCall[];
  /** Optional text to include alongside tool calls. */
  readonly text?: string;
}

/** A single round in the mock model's response sequence. */
export type MockModelRound = TextRound | ToolCallRound;

/** Configuration for createToolCallingMockModel. */
export interface MockModelConfig {
  /** Ordered sequence of rounds. Each doGenerate call consumes the next round. */
  readonly rounds: readonly MockModelRound[];
  /** Model ID for identification. @default "mock-tool-model" */
  readonly modelId?: string;
  /** Tokens per round for usage reporting. @default { input: 10, output: 20 } */
  readonly tokensPerRound?: { readonly input: number; readonly output: number };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isToolCallRound(round: MockModelRound): round is ToolCallRound {
  return "toolCalls" in round;
}

export function isTextRound(round: MockModelRound): round is TextRound {
  return "text" in round && !("toolCalls" in round);
}

// ---------------------------------------------------------------------------
// Usage and finish reason helpers
// ---------------------------------------------------------------------------

function makeUsage(input: number, output: number) {
  return {
    inputTokens: {
      total: input,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: undefined, reasoning: undefined },
  };
}

function makeFinishReason(reason: "stop" | "tool-calls") {
  return {
    unified: reason,
    raw: undefined,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a mock LanguageModel that supports tool calling.
 *
 * Each call to doGenerate/doStream consumes the next round from the config.
 * If the rounds are exhausted, the last round is repeated.
 */
export function createToolCallingMockModel(config: MockModelConfig): LanguageModel {
  const { rounds, modelId = "mock-tool-model", tokensPerRound } = config;
  const inputTokens = tokensPerRound?.input ?? 10;
  const outputTokens = tokensPerRound?.output ?? 20;

  let callIndex = 0;

  function nextRound(): MockModelRound {
    const round = rounds[callIndex] ?? rounds[rounds.length - 1];
    callIndex++;
    return round;
  }

  function buildContent(round: MockModelRound) {
    const content: Array<Record<string, unknown>> = [];

    if (isToolCallRound(round)) {
      // Add text content if present alongside tool calls
      if (round.text) {
        content.push({ type: "text" as const, text: round.text });
      }
      // Add tool call content items
      // AI SDK v3 expects `input` as a JSON string, not `args` as an object
      for (const tc of round.toolCalls) {
        content.push({
          type: "tool-call" as const,
          toolCallId: tc.id,
          toolName: tc.name,
          input: JSON.stringify(tc.args),
        });
      }
    } else {
      content.push({ type: "text" as const, text: round.text });
    }

    return content;
  }

  function finishReasonForRound(round: MockModelRound) {
    return makeFinishReason(isToolCallRound(round) ? "tool-calls" : "stop");
  }

  return {
    modelId,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,

    doGenerate: async () => {
      const round = nextRound();
      return {
        content: buildContent(round),
        finishReason: finishReasonForRound(round),
        usage: makeUsage(inputTokens, outputTokens),
        warnings: [],
      };
    },

    doStream: async () => {
      const round = nextRound();
      return {
        stream: new ReadableStream({
          start(controller) {
            if (isToolCallRound(round)) {
              // Emit text if present
              if (round.text) {
                const textId = "text-0";
                controller.enqueue({ type: "text-start" as const, id: textId });
                controller.enqueue({ type: "text-delta" as const, delta: round.text, id: textId });
                controller.enqueue({ type: "text-end" as const, id: textId });
              }
              // Emit tool calls
              // AI SDK v3 expects `input` as a JSON string for streaming too
              for (const tc of round.toolCalls) {
                controller.enqueue({
                  type: "tool-call" as const,
                  toolCallId: tc.id,
                  toolName: tc.name,
                  input: JSON.stringify(tc.args),
                });
              }
            } else {
              const textId = "text-0";
              controller.enqueue({ type: "text-start" as const, id: textId });
              controller.enqueue({
                type: "text-delta" as const,
                delta: round.text,
                id: textId,
              });
              controller.enqueue({ type: "text-end" as const, id: textId });
            }

            controller.enqueue({
              type: "finish" as const,
              finishReason: finishReasonForRound(round),
              usage: makeUsage(inputTokens, outputTokens),
            });
            controller.close();
          },
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock doesn't need full LanguageModel interface
  } as any;
}

// ---------------------------------------------------------------------------
// Simple text-only mock (convenience wrapper)
// ---------------------------------------------------------------------------

/**
 * Create a simple mock model that returns predetermined text responses.
 * Convenience wrapper for tests that don't need tool calling.
 */
export function createSimpleMockModel(responses: string[]): LanguageModel {
  return createToolCallingMockModel({
    rounds: responses.map((text) => ({ text })),
    modelId: "mock-simple-model",
  });
}

// ---------------------------------------------------------------------------
// Spy model (records what was sent to it)
// ---------------------------------------------------------------------------

/** Recorded call to the mock model. */
export interface RecordedModelCall {
  readonly messages: readonly unknown[];
  readonly system?: string;
  readonly tools?: Record<string, unknown>;
}

/**
 * Create a mock model that records all calls for inspection.
 * Useful for verifying what messages/system prompts were sent to the model.
 *
 * Note: The AI SDK v3 bakes the system prompt into the `prompt` messages
 * array (as a `{ role: "system", content: "..." }` message). This spy
 * extracts it from there for convenience.
 */
export function createSpyMockModel(responses: string[]): {
  model: LanguageModel;
  calls: RecordedModelCall[];
} {
  const calls: RecordedModelCall[] = [];
  let callIndex = 0;

  /** Extract system prompt from the prompt messages array. */
  function extractSystemPrompt(prompt: readonly any[]): string | undefined {
    const systemMsg = prompt.find((m: any) => m.role === "system");
    if (!systemMsg) return undefined;
    // System message content can be a string or structured
    if (typeof systemMsg.content === "string") return systemMsg.content;
    return systemMsg.content;
  }

  /** Extract non-system messages from the prompt array. */
  function extractMessages(prompt: readonly any[]): readonly unknown[] {
    return prompt.filter((m: any) => m.role !== "system");
  }

  const model = {
    modelId: "mock-spy-model",
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,

    doGenerate: async (options: Record<string, unknown>) => {
      const text = responses[callIndex] ?? responses[responses.length - 1] ?? "";
      callIndex++;
      const prompt = options.prompt as readonly any[];
      calls.push({
        messages: extractMessages(prompt),
        system: extractSystemPrompt(prompt),
        tools: options.tools as Record<string, unknown> | undefined,
      });
      return {
        content: [{ type: "text" as const, text }],
        finishReason: makeFinishReason("stop"),
        usage: makeUsage(10, 20),
        warnings: [],
      };
    },

    doStream: async (options: Record<string, unknown>) => {
      const text = responses[callIndex] ?? responses[responses.length - 1] ?? "";
      callIndex++;
      const prompt = options.prompt as readonly any[];
      calls.push({
        messages: extractMessages(prompt),
        system: extractSystemPrompt(prompt),
        tools: options.tools as Record<string, unknown> | undefined,
      });
      return {
        stream: new ReadableStream({
          start(controller) {
            const textId = "text-0";
            controller.enqueue({ type: "text-start" as const, id: textId });
            controller.enqueue({ type: "text-delta" as const, delta: text, id: textId });
            controller.enqueue({ type: "text-end" as const, id: textId });
            controller.enqueue({
              type: "finish" as const,
              finishReason: makeFinishReason("stop"),
              usage: makeUsage(10, 20),
            });
            controller.close();
          },
        }),
      };
    },
  } as any;

  return { model, calls };
}
