// ConversationHistory — closure-based conversation turn management.
//
// Manages conversation turns with optional truncation (sliding window
// by count and/or estimated token budget). Returns AI SDK ModelMessage
// arrays for use with generateText()/streamText().

import type { ModelMessage, UserModelMessage } from "ai";

import type {
  ConversationHistoryConfig,
  ConversationTurn,
  ResponseMessage,
  TruncationStrategy,
} from "../types";

// Constants

/** Default tokens-per-character ratio for English text. ~4 chars per token. */
const DEFAULT_TOKENS_PER_CHAR = 0.25;

// Internal state type

interface HistoryState {
  readonly turns: readonly ConversationTurn[];
}

// Resolved config (internal)

interface ResolvedConfig {
  readonly maxTurns: number;
  readonly maxTokens: number | undefined;
  readonly tokensPerChar: number;
  readonly truncation: TruncationStrategy;
}

function resolveConfig(config: ConversationHistoryConfig = {}): ResolvedConfig {
  const maxTurns = config.maxTurns ?? Number.POSITIVE_INFINITY;
  const maxTokens = config.maxTokens;
  const tokensPerChar = config.tokensPerChar ?? DEFAULT_TOKENS_PER_CHAR;

  let truncation: TruncationStrategy;
  if (config.truncation) {
    truncation = config.truncation;
  } else if (config.maxTurns !== undefined || config.maxTokens !== undefined) {
    truncation = "sliding-window";
  } else {
    truncation = "none";
  }

  return { maxTurns, maxTokens, tokensPerChar, truncation };
}

// Helpers

/**
 * Extract the total character count from a ModelMessage's content.
 * Handles both `string` and `Array<Part>` content formats.
 */
function getMessageTextLength(message: ModelMessage): number {
  const content = message.content;
  if (typeof content === "string") {
    return content.length;
  }
  if (Array.isArray(content)) {
    let length = 0;
    for (const part of content) {
      if ("text" in part && typeof part.text === "string") {
        length += part.text.length;
      }
      if ("input" in part) {
        length += JSON.stringify(part.input).length;
      }
      if ("output" in part) {
        length += JSON.stringify(part.output).length;
      }
    }
    return length;
  }
  return 0;
}

/** Wrap a plain string as a UserModelMessage. */
function toUserMessage(text: string): UserModelMessage {
  return { role: "user", content: text };
}

// Internal pure functions

function estimateTokensForTurns(
  turns: readonly ConversationTurn[],
  tokensPerChar: number = DEFAULT_TOKENS_PER_CHAR,
): number {
  let totalChars = 0;
  for (const turn of turns) {
    totalChars += getMessageTextLength(turn.userMessage);
    for (const msg of turn.responseMessages) {
      totalChars += getMessageTextLength(msg);
    }
  }
  return Math.ceil(totalChars * tokensPerChar);
}

function truncateTurns(
  state: HistoryState,
  config: ConversationHistoryConfig | undefined,
): HistoryState {
  const resolved = resolveConfig(config);

  if (resolved.truncation === "none") {
    return state;
  }

  let turns = [...state.turns];

  // Sliding window: enforce maxTurns
  while (turns.length > resolved.maxTurns) {
    turns = turns.slice(1);
  }

  // Token-based: enforce maxTokens
  if (resolved.maxTokens !== undefined) {
    while (
      turns.length > 0 &&
      estimateTokensForTurns(turns, resolved.tokensPerChar) > resolved.maxTokens
    ) {
      turns = turns.slice(1);
    }
  }

  return { turns };
}

function appendTurn(
  state: HistoryState,
  config: ConversationHistoryConfig | undefined,
  userMessage: string | UserModelMessage,
  responseMessages: readonly ResponseMessage[],
): HistoryState {
  const user: UserModelMessage =
    typeof userMessage === "string" ? toUserMessage(userMessage) : userMessage;

  const newTurns = [...state.turns, { userMessage: user, responseMessages: [...responseMessages] }];

  return truncateTurns({ turns: newTurns }, config);
}

function turnsToMessages(turns: readonly ConversationTurn[]): readonly ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const turn of turns) {
    messages.push(turn.userMessage);
    for (const msg of turn.responseMessages) {
      messages.push(msg);
    }
  }
  return messages;
}

function getLastTurn(state: HistoryState): ConversationTurn | undefined {
  const { turns } = state;
  return turns.length > 0 ? turns[turns.length - 1] : undefined;
}

// ConversationHistory — the public interface

/**
 * The ConversationHistory interface — the contract that message-builder.ts
 * and agent.utils.ts depend on.
 */
export interface ConversationHistory {
  /** Number of conversation turns currently stored. */
  readonly length: number;
  /** Whether the history is empty. */
  readonly isEmpty: boolean;
  /** Append a completed conversation turn. */
  append(
    userMessage: string | UserModelMessage,
    responseMessages: readonly ResponseMessage[],
  ): void;
  /** Convert to AI SDK ModelMessage array. */
  toMessages(): readonly ModelMessage[];
  /** Get a copy of all turns. */
  getTurns(): readonly ConversationTurn[];
  /** Get the most recent turn. */
  getLastTurn(): ConversationTurn | undefined;
  /** Estimate total token count. */
  estimateTokens(): number;
  /** Take a snapshot. */
  snapshot(): readonly ConversationTurn[];
  /** Restore from a snapshot. */
  restore(turns: readonly ConversationTurn[]): void;
  /** Clear all history. */
  clear(): void;
  /** Iterate over turns. */
  [Symbol.iterator](): Iterator<ConversationTurn>;
}

/**
 * Create a new ConversationHistory with closure-captured state.
 *
 * Manages conversation turns with optional truncation:
 * - `maxTurns` — sliding window by turn count
 * - `maxTokens` — sliding window by estimated token budget
 * - Both can be combined (whichever is stricter wins)
 *
 * @example
 * ```ts
 * // Sliding window with 20 turns max
 * const history = createConversationHistory({ maxTurns: 20 });
 *
 * // Token-limited history (approximate)
 * const bounded = createConversationHistory({ maxTokens: 4000 });
 *
 * // Unbounded history
 * const full = createConversationHistory();
 * ```
 */
export function createConversationHistory(config?: ConversationHistoryConfig): ConversationHistory {
  const resolved = resolveConfig(config);
  let state: HistoryState = { turns: [] };

  return {
    get length() {
      return state.turns.length;
    },

    get isEmpty() {
      return state.turns.length === 0;
    },

    append(
      userMessage: string | UserModelMessage,
      responseMessages: readonly ResponseMessage[],
    ): void {
      state = appendTurn(state, config, userMessage, responseMessages);
    },

    toMessages(): readonly ModelMessage[] {
      return turnsToMessages(state.turns);
    },

    getTurns(): readonly ConversationTurn[] {
      return [...state.turns];
    },

    getLastTurn(): ConversationTurn | undefined {
      return getLastTurn(state);
    },

    estimateTokens(): number {
      return estimateTokensForTurns(state.turns, resolved.tokensPerChar);
    },

    snapshot(): readonly ConversationTurn[] {
      return Object.freeze([...state.turns]);
    },

    restore(turns: readonly ConversationTurn[]): void {
      state = truncateTurns({ turns: [...turns] }, config);
    },

    clear(): void {
      state = { turns: [] };
    },

    [Symbol.iterator](): Iterator<ConversationTurn> {
      let index = 0;
      const turns = state.turns;
      return {
        next(): IteratorResult<ConversationTurn> {
          if (index < turns.length) {
            return { value: turns[index++]!, done: false } as IteratorYieldResult<ConversationTurn>;
          }
          return { value: undefined, done: true } as IteratorReturnResult<undefined>;
        },
      };
    },
  };
}
