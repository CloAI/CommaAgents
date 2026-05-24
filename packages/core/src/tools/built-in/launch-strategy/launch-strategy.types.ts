/** Structured payload returned by `launch_strategy.execute`. */
export interface LaunchStrategyData {
  /** The launched strategy's `name` field. */
  readonly strategyName: string;
  /** Absolute path to the strategy file that was launched. */
  readonly path: string;
  /**
   * Final text produced by the sub-strategy's entry flow.
   * Mirrors `AgentCallResult.text` from the underlying flow call.
   */
  readonly result: string;
  /** Why the flow stopped, when reported by the underlying runtime. */
  readonly finishReason?: string;
}
