import type { ModelMessage, UserModelMessage } from "ai";

import type {
  ContextStrategy,
  ConversationContextConfig,
  ConversationTurn,
  ResponseMessage,
} from "./conversation-context.types";

/** Default tokens-per-character ratio for English text. ~4 chars per token. */
const DEFAULT_TOKENS_PER_CHAR = 0.25;

interface ContextState {
  readonly turns: readonly ConversationTurn[];
}

interface ResolvedContextConfig {
  readonly maxTurns: number;
  readonly maxTokens: number | undefined;
  readonly tokensPerChar: number;
  readonly strategy: ContextStrategy;
}

function resolveContextConfig(
  config: ConversationContextConfig = {},
): ResolvedContextConfig {
  const maxTurns = config.maxTurns ?? Number.POSITIVE_INFINITY;
  const maxTokens = config.maxTokens;
  const tokensPerChar = config.tokensPerChar ?? DEFAULT_TOKENS_PER_CHAR;

  let strategy: ContextStrategy;
  if (config.strategy) {
    strategy = config.strategy;
  } else if (config.maxTurns !== undefined || config.maxTokens !== undefined) {
    strategy = "sliding-window";
  } else {
    strategy = "none";
  }

  return { maxTurns, maxTokens, tokensPerChar, strategy };
}

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

/** Estimate token count for a set of turns. */
function estimateTokensForTurns(
  turns: readonly ConversationTurn[],
  tokensPerChar: number = DEFAULT_TOKENS_PER_CHAR,
): number {
  let totalChars = 0;
  for (const turn of turns) {
    totalChars += getMessageTextLength(turn.userMessage);
    for (const responseMessage of turn.responseMessages) {
      totalChars += getMessageTextLength(responseMessage);
    }
  }
  return Math.ceil(totalChars * tokensPerChar);
}

/** Apply the configured strategy to a set of turns. */
function applyStrategy(
  state: ContextState,
  config: ConversationContextConfig | undefined,
): ContextState {
  const resolvedConfig = resolveContextConfig(config);

  if (resolvedConfig.strategy === "none") {
    return state;
  }

  let turns = [...state.turns];

  // Sliding window: enforce maxTurns
  while (turns.length > resolvedConfig.maxTurns) {
    turns = turns.slice(1);
  }

  // Token-based: enforce maxTokens
  if (resolvedConfig.maxTokens !== undefined) {
    while (
      turns.length > 0 &&
      estimateTokensForTurns(turns, resolvedConfig.tokensPerChar) >
        resolvedConfig.maxTokens
    ) {
      turns = turns.slice(1);
    }
  }

  return { turns };
}

/** Append a turn and apply the strategy. */
function appendTurn(
  state: ContextState,
  config: ConversationContextConfig | undefined,
  userMessage: string | UserModelMessage,
  responseMessages: readonly ResponseMessage[],
): ContextState {
  const user: UserModelMessage =
    typeof userMessage === "string" ? toUserMessage(userMessage) : userMessage;

  const newTurns = [
    ...state.turns,
    { userMessage: user, responseMessages: [...responseMessages] },
  ];

  return applyStrategy({ turns: newTurns }, config);
}

/** Flatten turns into a sequential ModelMessage array. */
function turnsToMessages(
  turns: readonly ConversationTurn[],
): readonly ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const turn of turns) {
    messages.push(turn.userMessage);
    for (const responseMessage of turn.responseMessages) {
      messages.push(responseMessage);
    }
  }
  return messages;
}

/** Get the last turn from state. */
function getLastTurn(state: ContextState): ConversationTurn | undefined {
  const { turns } = state;
  return turns.length > 0 ? turns[turns.length - 1] : undefined;
}

/**
 * The ConversationContext interface — manages the accumulated state of an
 * ongoing conversation between a user and an AI agent.
 *
 * Holds all conversation turns (user messages + response messages including
 * tool calls and tool results) and provides views over them as either
 * structured turns or flat AI SDK message arrays.
 */
export interface ConversationContext {
  /** Number of conversation turns currently stored. */
  readonly length: number;

  /** Whether the context has no turns. */
  readonly isEmpty: boolean;

  /**
   * Append a completed conversation turn.
   * The configured strategy is applied after appending.
   */
  append(
    userMessage: string | UserModelMessage,
    responseMessages: readonly ResponseMessage[],
  ): void;

  /**
   * All turns as a flat AI SDK ModelMessage array.
   * Messages are ordered: [user1, assistant1, tool1, ..., userN, assistantN, toolN].
   * This is the format expected by `generateText()` / `streamText()`.
   */
  allMessages(): readonly ModelMessage[];

  /**
   * All conversation turns (user + response pairs).
   * Returns a shallow copy — safe to iterate without affecting internal state.
   */
  allTurns(): readonly ConversationTurn[];

  /** The most recent conversation turn, or undefined if empty. */
  lastTurn(): ConversationTurn | undefined;

  /** Estimate total token count across all stored turns. */
  estimateTokens(): number;

  /**
   * Take a frozen snapshot of the current turns.
   * The snapshot is independent of future mutations.
   */
  snapshot(): readonly ConversationTurn[];

  /**
   * Restore from a previously taken snapshot.
   * The current strategy is applied to the restored turns.
   */
  restore(turns: readonly ConversationTurn[]): void;

  /** Clear all turns from the context. */
  clear(): void;

  /** Iterate over turns. */
  [Symbol.iterator](): Iterator<ConversationTurn>;
}

/**
 * Create a new ConversationContext with closure-captured state.
 *
 * Manages conversation turns with configurable strategies:
 * - `maxTurns` — sliding window by turn count
 * - `maxTokens` — sliding window by estimated token budget
 * - Both can be combined (whichever is stricter wins)
 *
 * @example
 * ```ts
 * // Sliding window with 20 turns max
 * const context = createConversationContext({ maxTurns: 20 });
 *
 * // Token-limited context (approximate)
 * const bounded = createConversationContext({ maxTokens: 4000 });
 *
 * // Unbounded context
 * const full = createConversationContext();
 * ```
 */
export function createConversationContext(
  config?: ConversationContextConfig,
): ConversationContext {
  const resolvedConfig = resolveContextConfig(config);
  let state: ContextState = { turns: [] };

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

    allMessages(): readonly ModelMessage[] {
      return turnsToMessages(state.turns);
    },

    allTurns(): readonly ConversationTurn[] {
      return [...state.turns];
    },

    lastTurn(): ConversationTurn | undefined {
      return getLastTurn(state);
    },

    estimateTokens(): number {
      return estimateTokensForTurns(state.turns, resolvedConfig.tokensPerChar);
    },

    snapshot(): readonly ConversationTurn[] {
      return Object.freeze([...state.turns]);
    },

    restore(turns: readonly ConversationTurn[]): void {
      state = applyStrategy({ turns: [...turns] }, config);
    },

    clear(): void {
      state = { turns: [] };
    },

    [Symbol.iterator](): Iterator<ConversationTurn> {
      let turnIndex = 0;
      const currentTurns = state.turns;
      return {
        next(): IteratorResult<ConversationTurn> {
          if (turnIndex < currentTurns.length) {
            return {
              value: currentTurns[turnIndex++]!,
              done: false,
            } as IteratorYieldResult<ConversationTurn>;
          }
          return {
            value: undefined,
            done: true,
          } as IteratorReturnResult<undefined>;
        },
      };
    },
  };
}
