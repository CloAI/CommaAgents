/** What the stop slice needs from the rest of the run. */
export interface RunStopOptions {
  /** An agent is working, so there is something to stop. */
  readonly active: boolean;
  /** Another change owns the run right now, such as a strategy switch or context dialog. */
  readonly blocked: boolean;
  /** Runs before the stop request, such as keeping a pending draft. */
  readonly onStop: () => void;
}

/** Stopping the followed run. */
export interface RunStop {
  /** An agent is working, so Stop is shown. */
  readonly active: boolean;
  /** Active, connected, and not blocked by another change. */
  readonly canStop: boolean;
  /** Stop the run once, keeping any unsent draft. */
  readonly stop: () => void;
  /** Whether the stop request is awaiting acknowledgement. */
  readonly isStopping: boolean;
  /** Failure from the latest stop attempt. */
  readonly error: string | undefined;
}
