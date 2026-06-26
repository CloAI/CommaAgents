import type {
  AgentStreamEventWire,
  ContextUsageWire,
  ConversationInputWire,
  ConversationRecordWire,
  ConversationRetentionEventWire,
  McpServerStatusWire,
  RequestPermissionMessage,
  RequestQuestionMessage,
  RunOverview,
  RunStatus,
  RunSummary,
  Usage,
} from "@comma-agents/daemon";
import type { Dispatch, SetStateAction } from "react";

import type { WebSocketStatus } from "../useWebSocket/useWebSocket.types";

/** Stable identifier shared by the TUI and daemon for the run's life. */
export type ChatRunId = string;

/** Sender role for display purposes. */
export type MessageRole = "user" | "agent" | "system";

/** Narrow the daemon's stream event union to a specific event kind. */
type StreamEventOf<EventKind extends AgentStreamEventWire["type"]> = Extract<
  AgentStreamEventWire,
  { type: EventKind }
>;

/**
 * A single segment within an agent's message body.
 *
 * Segments accumulate the daemon's `agent_streaming` wire events
 * (`AgentStreamEventWire`) into render state: ordered, typed body parts the
 * UI can render with the right affordance (collapsed tool call panel, dimmed
 * thinking block, code-formatted result, etc.). `tool-call` and `tool-result`
 * segments are the wire events verbatim; `text` and `thinking` segments add a
 * `streaming` flag because consecutive deltas are folded into one segment
 * that closes when the stream ends.
 */
export type MessageSegment =
  | (StreamEventOf<"text"> & {
      /** Whether this text segment is still receiving streaming tokens. */
      readonly streaming: boolean;
    })
  | StreamEventOf<"tool-call">
  | StreamEventOf<"tool-result">
  | StreamEventOf<"retention">
  | (StreamEventOf<"thinking"> & {
      /** Whether the reasoning stream is still receiving tokens. */
      readonly streaming: boolean;
    });

/** A single message in the chat log. */
export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  /** Agent name (or "you" for user, "system" for system messages). */
  readonly sender: string;
  /**
   * Full accumulated text for the message.
   *
   * For `user` and `system` messages this is the only body. For `agent`
   * messages this is a flattened concatenation of all `text`-type segments,
   * preserved primarily for backwards compatibility with consumers that
   * don't yet understand `segments`.
   */
  readonly text: string;
  /**
   * Ordered, typed body parts for richer rendering (tool calls, reasoning,
   * MCP, etc.). When omitted, consumers should fall back to `text`.
   */
  readonly segments?: readonly MessageSegment[];
  /** Whether this message is still receiving streaming tokens. */
  readonly streaming: boolean;
  /** Tool call id of the `launch_strategy` invocation that spawned this message. */
  readonly parentToolCallId?: string;
  /** Provider/model identifier used for this agent call. */
  readonly model?: string;
  /** Maximum model context tokens, when known. */
  readonly contextWindow?: number;
  /** Final token usage reported by the model. */
  readonly usage?: Usage;
  /** Final model-step context usage. */
  readonly contextUsage?: ContextUsageWire;
  /** Completion timestamp for finished agent calls. */
  readonly completedAt?: number;
  readonly timestamp: number;
}

/**
 * UI lifecycle status for a chat run.
 *
 * Extends the daemon's `RunStatus` union (`pending | running | completed |
 * error | cancelled`) with TUI-only states that the daemon does not model:
 * - `idle` — run exists but hasn't started a run yet.
 * - `waiting_input` — derived from an unanswered `request_input`.
 * - `waiting_permission` — derived from an unanswered `request_permission`.
 * - `waiting_question` — derived from an unanswered `request_question`.
 */
export type ChatStatus =
  | RunStatus
  | "idle"
  | "waiting_input"
  | "waiting_permission"
  | "waiting_question";

/** User-initiated execution waiting for daemon preparation or execution. */
export interface PendingChatExecution {
  readonly mode: "start" | "continue";
  readonly input: string | null;
  /** Request id for the currently pending prepare/start/continue command. */
  readonly requestId: string;
  /** Locally queued user message for a continuation, if one was rendered. */
  readonly queuedMessageId?: string;
}

/** A single chat run's state — 1:1 with a strategy run. */
export interface ChatRun {
  /** Stable run identifier and map key. */
  readonly id: ChatRunId;
  /** Run id assigned by the daemon after `strategy_started`. */
  readonly daemonRunId: string | null;
  /** Human-readable label (strategy name or file path). */
  readonly label: string;
  /** Path to the strategy file being run. */
  readonly strategyPath: string | null;
  /**
   * Name of the strategy used for this run, when known. Runs started via
   * `startStrategy` learn this from `strategy_started`. May be null until the
   * daemon reports it.
   */
  readonly strategyName: string | null;
  /** UI lifecycle status (see `ChatStatus`). */
  readonly status: ChatStatus;
  /** Mirror of the daemon's `RunStatus` for this run, if known. */
  readonly runStatus: RunStatus | null;
  /** Latest error message, or null. */
  readonly error: string | null;
  /** Execution waiting for daemon preparation or execution. */
  readonly pendingExecution: PendingChatExecution | null;
  /** MCP connection outcomes returned by the latest preparation. */
  readonly mcpServers: readonly McpServerStatusWire[];
  /** Whether failed enabled servers require a Continue/Cancel decision. */
  readonly pendingMcpConfirmation: boolean;
  /** Agent currently waiting for user input, or null. */
  readonly pendingInputAgent: string | null;
  /**
   * Queue of `request_permission` messages awaiting user decisions, stored
   * as received. The head (index 0) is the currently-displayed prompt; its
   * `requestId` is echoed back in the `permission_decision` reply.
   */
  readonly pendingPermissionRequests: readonly RequestPermissionMessage[];
  /**
   * Queue of `request_question` messages awaiting user answers, stored as
   * received. The head's `requestId` is echoed back in `question_response`.
   */
  readonly pendingQuestionRequests: readonly RequestQuestionMessage[];
  /** Accumulated messages for this run. */
  readonly messages: readonly ChatMessage[];
  /** Stack of active `launch_strategy` tool-call ids for nested strategy output. */
  readonly activeLaunchStrategyIds: readonly string[];
  /** Creation timestamp (ms since epoch). */
  readonly createdAt: number;
  /** Last-updated timestamp (ms since epoch). */
  readonly updatedAt: number;
}

/** Pending daemon permission request rendered by the chat UI. */
export type PendingPermissionRequest = RequestPermissionMessage;
/** Pending daemon question request rendered by the chat UI. */
export type PendingQuestionRequest = RequestQuestionMessage;

/** @internal Shared state contracts used by the chat run operation hooks. */
export type ChatRunsState = ReadonlyMap<ChatRunId, ChatRun>;
/** @internal Setter for the provider-owned chat run collection. */
export type SetChatRuns = Dispatch<SetStateAction<ChatRunsState>>;

/** Initial overrides accepted by `createChatRun`. */
export interface CreateRunInit {
  /** Human-readable label. Defaults to "New run". */
  readonly label?: string;
  /** Strategy file path, if known at creation time. */
  readonly strategyPath?: string;
}

/** Lightweight metadata for a daemon-persisted run. */
export type PersistedRunMeta = RunOverview;

export type PersistedConversationRecord = ConversationRecordWire;
export type PersistedConversationRetentionEvent =
  ConversationRetentionEventWire;
export type PersistedConversationInput = ConversationInputWire;

/** Value exposed by `ChatRunsContext`. */
export interface ChatRunsContextType {
  /** All runs keyed by their stable run id. */
  readonly chatRuns: ReadonlyMap<ChatRunId, ChatRun>;
}

/** Internal writable store shared by chat run domain hooks. */
export interface ChatRunsStore extends ChatRunsContextType {
  readonly setChatRuns: SetChatRuns;
}

/** Props for the `ChatRunsContextProvider` component. */
export interface ChatRunsContextProviderProps {
  /** Child elements that can consume chat run state. */
  readonly children: React.ReactNode;
}

/**
 * Value returned by `useChat()` — a view of a single run with bound action methods.
 *
 * When the provided `chatRunId` doesn't match any run, all fields return
 * empty/null values and action methods other than `startStrategy` are no-ops.
 */
export interface UseChatState {
  /** Id of the run this view is bound to, or null. */
  readonly chatRunId: ChatRunId | null;
  readonly messages: readonly ChatMessage[];
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  /** Name of the strategy that produced this run, if known. */
  readonly strategyName: string | null;
  /** Strategy file path, if known. */
  readonly strategyPath: string | null;
  /** Current pending permission request (head of queue), or null. */
  readonly pendingPermissionRequest: RequestPermissionMessage | null;
  /** Current pending question request (head of queue), or null. */
  readonly pendingQuestionRequest: RequestQuestionMessage | null;
  /** Alias for `daemonRunId` — preserved for back-compatibility. */
  readonly runId: string | null;
  readonly mcpServers: readonly McpServerStatusWire[];
  readonly pendingMcpConfirmation: boolean;
  /** Current daemon WebSocket connection status. */
  readonly connectionStatus: WebSocketStatus;
  /** Create a new run and start a strategy on it. Returns the stable run id. */
  readonly startStrategy: (
    strategyPath: string,
    input?: string,
    cwd?: string,
    manifestPath?: string,
  ) => ChatRunId;
  /** Send user input to the bound run. No-op if no run or no pending input. */
  readonly sendInput: (text: string) => void;
  /**
   * Queue a steering message for the bound run. No-op unless the run is
   * live and running/pending.
   */
  readonly sendSteer: (text: string) => void;
  /** Resolve the pending permission request for the bound run. */
  readonly sendPermissionDecision: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  /** Resolve the pending question request for the bound run. */
  readonly sendQuestionResponse: (response: string) => void;
  /** Clear the bound run's UI projection. No-op if no run. */
  readonly reset: () => void;
  /** Send `stop_run` for the bound run. No-op if no run is active. */
  readonly stop: () => void;
}

export type { RunOverview, RunStatus, RunSummary };
