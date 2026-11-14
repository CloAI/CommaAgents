/** How a headless run answers sandbox permission requests. */
export type HeadlessApproval = "allow" | "deny";

/** Options for executing one strategy without a terminal UI. */
export interface HeadlessRunOptions {
  /** Strategy file path, or a discovered strategy name or label. */
  readonly strategy: string;
  /** First user message sent to the strategy. */
  readonly input: string;
  /** Working directory the run operates in. @default process.cwd() */
  readonly cwd?: string;
  /** `provider/model` per role name for this run; these win over the daemon's configured roles. */
  readonly modelRoles?: Readonly<Record<string, string>>;
  /** User turns accepted before the run is stopped; the first input counts as one. @default 1 */
  readonly maxUserTurns?: number;
  /** Decision returned for every sandbox permission request. @default "deny" */
  readonly approve?: HeadlessApproval;
  /** Strategies selected in order after the first finishes, each continuing the same conversation. @default [] */
  readonly then?: readonly string[];
  /** User message sent to each `then` strategy. @default DEFAULT_CONTINUATION_INPUT */
  readonly thenInput?: string;
  /** Print one JSON summary instead of streaming agent text. @default false */
  readonly json?: boolean;
}

/** Final agent text produced during a headless run. */
export interface HeadlessAgentOutput {
  /** Agent that produced the text. */
  readonly agentName: string;
  /** Execution that owns the message; differs from the root for subagents. */
  readonly runId: string;
  /** Visible text content of the completed message. */
  readonly text: string;
}

/** Result of a headless run, printed with `--json`. */
export interface HeadlessRunResult {
  /** Root run identifier, usable to reopen the conversation in the TUI or UI. */
  readonly runId: string;
  /** Terminal outcome of the run. */
  readonly status: string;
  /** `turn-limit` when the run was stopped because `maxUserTurns` was used up; the work itself finished. */
  readonly endedBy: "turn-limit" | "strategy";
  /** Agent text messages from the root run and its children, in completion order. */
  readonly outputs: readonly HeadlessAgentOutput[];
  /** Questions answered automatically because no user was present. */
  readonly autoAnsweredQuestions: number;
  /** Sandbox permission requests answered with the configured approval. */
  readonly permissionRequests: number;
  /** Total prompt and completion tokens across completed messages. */
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}
