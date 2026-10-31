/** A strategy an agent may hand work to through the `delegate` tool. */
export interface SubagentTarget {
  /** Name the agent uses in `delegate` calls, e.g. `explore`. */
  readonly name: string;
  /** When to use this subagent; shown to the delegating agent. */
  readonly description?: string;
  /** Absolute path to the subagent's strategy file. */
  readonly strategyPath: string;
  /** Project manifest the strategy belongs to, when any. */
  readonly manifestPath?: string;
}

/** A JSON value parsed from a subagent's structured final answer. */
export type DelegateJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly DelegateJsonValue[]
  | { readonly [key: string]: DelegateJsonValue };

/** Outcome of one delegated task. */
export interface DelegateTaskResult {
  /** Subagent that ran the task. */
  readonly agent: string;
  /** Short task label supplied by the caller. */
  readonly description: string;
  /** Whether the subagent finished and returned an answer. */
  readonly ok: boolean;
  /** Final text of the subagent, or the failure message. */
  readonly text: string;
  /** Parsed JSON when the final text is a JSON object or array, as produced by subagents with an `outputSchema`. */
  readonly data?: DelegateJsonValue;
}

/** Structured payload returned by `delegate.execute`. */
export interface DelegateData {
  /** One result per task, in request order. */
  readonly results: readonly DelegateTaskResult[];
}
