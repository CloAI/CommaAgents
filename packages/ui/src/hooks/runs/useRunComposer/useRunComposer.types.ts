/** What a submitted message does right now. */
export type ComposerMode = "continue" | "reply" | "steer";

/** An agent that can receive the message. */
export interface ComposerRecipient {
  /** Input ID when replying, message ID when steering. */
  readonly id: string;
  readonly name: string;
}

/** Everything that decides whether a message can be sent. */
export interface ComposerGate {
  readonly mode: ComposerMode;
  /** The run's initial snapshot has arrived. */
  readonly initialized: boolean;
  readonly connected: boolean;
  /** A strategy change or stop request is in flight. */
  readonly busy: boolean;
  /** The saved strategy is still installed, which continuing needs. */
  readonly strategyAvailable: boolean;
  readonly recipient: ComposerRecipient | undefined;
}

/** The followed run's message composer. */
export interface RunComposer {
  readonly mode: ComposerMode;
  /** Agents that can receive the message; empty when continuing. */
  readonly recipients: readonly ComposerRecipient[];
  /** Chosen recipient; the only one when there is exactly one. */
  readonly recipient: ComposerRecipient | undefined;
  readonly selectRecipient: (id: string) => void;
  readonly canSubmit: boolean;
  /** Continue, reply, or steer according to the mode. */
  readonly submit: (text: string) => Promise<string | undefined>;
}
