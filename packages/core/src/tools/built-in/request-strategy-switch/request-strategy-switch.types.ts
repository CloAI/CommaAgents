/** A confirmed request to continue the conversation in another strategy. */
export interface StrategySwitchRequest {
  /** Absolute path to the selected strategy file. */
  readonly strategyPath: string;
  /** Project manifest the strategy belongs to, when any. */
  readonly manifestPath?: string;
}

/**
 * Queue a strategy switch that the runtime performs when the current turn hands back to the user.
 * Rejects when the run cannot switch, for example inside a child run.
 */
export type StrategySwitchHandle = (
  request: StrategySwitchRequest,
) => Promise<void>;

/** Structured payload returned by `request_strategy_switch.execute`. */
export interface RequestStrategySwitchData {
  /** Strategy the agent asked to switch to. */
  readonly strategyName: string;
  /** Whether the user approved; an approved switch takes effect before the user's next message. */
  readonly approved: boolean;
  /** The user's answer to the confirmation question. */
  readonly response: string;
}
