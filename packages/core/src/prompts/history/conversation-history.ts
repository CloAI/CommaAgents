// ConversationHistory — Manages conversation turns with windowing and truncation.
//
// This is a class (justified by mutable state: accumulating conversation turns).
// Extracted from BaseAgent's inline _history array to be reusable across
// different agent types and testable independently.

import type {
  ChatMessage,
  ConversationHistoryConfig,
  ConversationTurn,
  TruncationStrategy,
} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default tokens-per-character ratio for English text. ~4 chars per token. */
const DEFAULT_TOKENS_PER_CHAR = 0.25;

// ---------------------------------------------------------------------------
// ConversationHistory
// ---------------------------------------------------------------------------

/**
 * Manages a conversation's message history with configurable truncation.
 *
 * Supports:
 * - **Sliding window**: Keep the most recent N turns
 * - **Token-based truncation**: Drop oldest turns when estimated token count exceeds a limit
 * - **Snapshot/restore**: Save and restore history state
 * - **Iteration**: Access turns as an iterable
 *
 * @example
 * ```ts
 * const history = new ConversationHistory({ maxTurns: 10 });
 *
 * history.append("What is TypeScript?", "TypeScript is a typed superset of JavaScript.");
 * history.append("How do I use generics?", "Generics allow you to write reusable...");
 *
 * // Get messages for the AI SDK
 * const messages = history.toMessages();
 * // => [{ role: "user", content: "What is..." }, { role: "assistant", content: "TypeScript is..." }, ...]
 * ```
 */
export class ConversationHistory {
  private readonly _turns: ConversationTurn[] = [];
  private readonly _maxTurns: number;
  private readonly _maxTokens: number | undefined;
  private readonly _tokensPerChar: number;
  private readonly _truncation: TruncationStrategy;

  constructor(config: ConversationHistoryConfig = {}) {
    this._maxTurns = config.maxTurns ?? Number.POSITIVE_INFINITY;
    this._maxTokens = config.maxTokens;
    this._tokensPerChar = config.tokensPerChar ?? DEFAULT_TOKENS_PER_CHAR;

    // Default truncation: sliding-window if maxTurns or maxTokens is set, otherwise none
    if (config.truncation) {
      this._truncation = config.truncation;
    } else if (config.maxTurns !== undefined || config.maxTokens !== undefined) {
      this._truncation = "sliding-window";
    } else {
      this._truncation = "none";
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Number of conversation turns currently stored. */
  get length(): number {
    return this._turns.length;
  }

  /** Whether the history is empty. */
  get isEmpty(): boolean {
    return this._turns.length === 0;
  }

  /**
   * Append a completed conversation turn (user message + assistant response).
   * If truncation is enabled, oldest turns may be dropped.
   */
  append(userMessage: string, assistantMessage: string): void {
    this._turns.push({ userMessage, assistantMessage });
    this._truncate();
  }

  /**
   * Convert the history to an array of `ChatMessage` objects suitable for
   * the Vercel AI SDK's `messages` parameter.
   *
   * Each turn produces two messages: `{ role: "user", ... }` and `{ role: "assistant", ... }`.
   */
  toMessages(): readonly ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const turn of this._turns) {
      messages.push({ role: "user", content: turn.userMessage });
      messages.push({ role: "assistant", content: turn.assistantMessage });
    }
    return messages;
  }

  /**
   * Get a copy of all turns.
   */
  getTurns(): readonly ConversationTurn[] {
    return [...this._turns];
  }

  /**
   * Get the most recent turn, or `undefined` if history is empty.
   */
  getLastTurn(): ConversationTurn | undefined {
    return this._turns.length > 0 ? this._turns[this._turns.length - 1] : undefined;
  }

  /**
   * Estimate the total token count of the history.
   * Uses the configured `tokensPerChar` ratio (approximate).
   */
  estimateTokens(): number {
    let totalChars = 0;
    for (const turn of this._turns) {
      totalChars += turn.userMessage.length + turn.assistantMessage.length;
    }
    return Math.ceil(totalChars * this._tokensPerChar);
  }

  /**
   * Take a snapshot of the current history state.
   * Returns a frozen copy that can be passed to `restore()`.
   */
  snapshot(): readonly ConversationTurn[] {
    return Object.freeze([...this._turns]);
  }

  /**
   * Restore the history from a previous snapshot.
   * Replaces the current history entirely, then applies truncation.
   */
  restore(turns: readonly ConversationTurn[]): void {
    this._turns.length = 0;
    for (const turn of turns) {
      this._turns.push({ ...turn });
    }
    this._truncate();
  }

  /** Clear all conversation history. */
  clear(): void {
    this._turns.length = 0;
  }

  /** Iterate over conversation turns. */
  [Symbol.iterator](): Iterator<ConversationTurn> {
    let index = 0;
    const turns = this._turns;
    return {
      next(): IteratorResult<ConversationTurn> {
        if (index < turns.length) {
          return { value: turns[index++], done: false };
        }
        return { value: undefined as unknown as ConversationTurn, done: true };
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Truncation
  // ---------------------------------------------------------------------------

  /**
   * Apply truncation strategy after appending a turn.
   * Drops oldest turns until within limits.
   */
  private _truncate(): void {
    if (this._truncation === "none") {
      return;
    }

    // Sliding window: enforce maxTurns
    while (this._turns.length > this._maxTurns) {
      this._turns.shift();
    }

    // Token-based: enforce maxTokens
    if (this._maxTokens !== undefined) {
      while (this._turns.length > 0 && this.estimateTokens() > this._maxTokens) {
        this._turns.shift();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new `ConversationHistory` instance.
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
  return new ConversationHistory(config);
}
