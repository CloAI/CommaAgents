import type { DaemonChannelMap } from "@comma-agents/daemon/protocol";

/** One event on a run's channel. */
export type RunChannelMessage = DaemonChannelMap["runs"]["message"];

/** Each channel event's payload by its type. */
export type RunEventMap = {
  readonly [Message in RunChannelMessage as Message["type"]]: Message["data"];
};

/** Last authoritative daemon snapshot, including the saved strategy. */
export type RunSnapshot = RunEventMap["run.state"];

/** One text, reasoning, or tool block of a message. */
export type RunContent = Extract<
  RunChannelMessage,
  { type: "agent.stream" }
>["data"]["content"];

/** Lifecycle of the run as far as the channel can tell. */
export type RunStatus =
  | "loading"
  | "prepared"
  | "running"
  | "completed"
  | "stopped"
  | "failed";

interface RunMessageBase {
  /** Identity shared by the streamed and final forms of the message. */
  readonly id: string;
  /** When the daemon created the message, as an ISO timestamp. */
  readonly createdAt: string;
  /** Blocks of the message by position. */
  readonly content: readonly RunContent[];
  /** Whether more content may still arrive. */
  readonly streaming: boolean;
}

/** A message the user sent into the run. */
export interface RunUserMessage extends RunMessageBase {
  readonly role: "user";
}

/** Token counts reported by the provider across every step of one response. */
export interface RunUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** How full the context was at the final model step of one response. */
export interface RunContextUsage {
  readonly totalTokens: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly inputTokenDetails?: {
    readonly noCacheTokens?: number;
    readonly cacheReadTokens?: number;
    readonly cacheWriteTokens?: number;
  };
}

/** One agent invocation's output so far. */
export interface RunAgentMessage extends RunMessageBase {
  readonly role: "agent";
  /** Agent that produced the message. */
  readonly agentName: string;
  /** Model the agent called, for model-backed agents. */
  readonly model?: string;
  /** Size of the model's context window in tokens, when known. */
  readonly contextWindow?: number;
  /** When the invocation ended, as an ISO timestamp. */
  readonly completedAt?: string;
  /** Set when the invocation was cut short instead of completing. */
  readonly interruption?: "stopped" | "failed";
  /** Total tokens used, known once the invocation completed. */
  readonly usage?: RunUsage;
  /** Final-step context usage, known once the invocation completed. */
  readonly contextUsage?: RunContextUsage;
  /** Why an invocation was deliberately interrupted. */
  readonly cancellationReason?: "user_steering";
}

/** A human-input request awaiting an answer. */
export type RunPendingInput = Extract<
  RunChannelMessage,
  { type: "input.requested" }
>["data"];

/** A steerable model invocation currently executing. */
export interface RunActiveAgent {
  readonly runId: string;
  readonly messageId: string;
  readonly agentName: string;
  readonly createdAt: string;
}

/** A durable strategy transition shown between conversation messages. */
export interface RunStrategyMessage extends RunMessageBase {
  readonly role: "strategy";
}

/** Anything shown as one section of the run. */
export type RunMessage = RunUserMessage | RunAgentMessage | RunStrategyMessage;

/** A subagent or launched strategy running as a child of this run. */
export type RunChild = Extract<
  RunChannelMessage,
  { type: "child.run" }
>["data"];

/** Everything the channel has said about one run. */
export interface RunFeedState {
  /** Last authoritative snapshot; absent until the first one arrives. */
  readonly snapshot?: RunSnapshot;
  /** Failure reported mid-run, which outranks the snapshot's own outcome. */
  readonly failure?: string;
  /** Messages in the order they started. */
  readonly messages: readonly RunMessage[];
  /** Requests restored on subscription and updated as agents wait. */
  readonly pendingInputs: readonly RunPendingInput[];
  /** Model invocations that can receive steering. */
  readonly activeAgents: readonly RunActiveAgent[];
  /** Child runs launched by this run's tools, in launch order. */
  readonly children: readonly RunChild[];
  /** Whether an authoritative initial snapshot has arrived. */
  readonly initialized: boolean;
}

/** Where the run stands, derived from its feed. */
export interface RunStatusView {
  readonly status: RunStatus;
  /** Why the run failed, once it has. */
  readonly error?: string;
}

/** A followed run: its channel state plus where it stands. */
export type RunFeed = RunFeedState & RunStatusView;
