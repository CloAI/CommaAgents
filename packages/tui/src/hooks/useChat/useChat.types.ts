import type { RunOverview, RunStatus, RunSummary } from "@comma-agents/daemon";

import type { WebSocketStatus } from "../useWebSocket/useWebSocket.types";

/** Local identifier for a chat run (UUID, stable for the run's life). */
export type ChatRunId = string;

/** Sender role for display purposes. */
export type MessageRole = "user" | "agent" | "system";

/**
 * A single segment within an agent's message body.
 *
 * Agents stream a sequence of typed events (text, tool calls, tool results,
 * reasoning/thinking, MCP calls). Rather than collapsing all of them into a
 * single text blob, we keep an ordered list of segments so the UI can render
 * each kind with the right affordance (collapsed tool call panel, dimmed
 * thinking block, code-formatted result, etc.).
 */
export type MessageSegment =
  | {
      readonly type: "text";
      readonly text: string;
      /** Whether this text segment is still receiving streaming tokens. */
      readonly streaming: boolean;
    }
  | {
      readonly type: "tool-call";
      /**
       * Correlation id from the daemon's `tool-call` wire event. Pairs
       * this call with its eventual `tool-result` segment so the renderer
       * can collapse them into a single row even when calls run
       * concurrently or are interleaved with text/thinking.
       */
      readonly toolCallId: string;
      readonly toolName: string;
      /** Raw JSON-encoded arguments string from the wire protocol. */
      readonly args: string;
    }
  | {
      readonly type: "tool-result";
      /** Correlates with the `tool-call` segment that started this invocation. */
      readonly toolCallId: string;
      readonly toolName: string;
      readonly output: string;
      /**
       * Outcome of the tool invocation. `running` is implicit (no
       * `tool-result` segment for this `toolCallId` yet); once a result
       * arrives it is either `completed` or `error`.
       */
      readonly status: "completed" | "error";
      /** Failure message when `status === "error"`. */
      readonly error?: string;
    }
  | {
      readonly type: "thinking";
      /**
       * Stable identifier from the model's reasoning stream. Used to route
       * `thinking` deltas and `thinking-end` events back to the segment
       * opened by the matching `thinking-start`.
       */
      readonly id: string;
      readonly text: string;
      /** Whether the reasoning stream is still receiving tokens. */
      readonly streaming: boolean;
    }
  | {
      readonly type: "mcp-call";
      readonly serverName: string;
      readonly toolName: string;
      readonly args: string;
      readonly output?: string;
    };

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
  readonly timestamp: number;
}

/**
 * A pending permission request from the daemon — mirrors the wire fields
 * the TUI needs to render the `PermissionPrompt`.
 */
export interface PendingPermissionRequest {
  /** Correlates with the `request_permission` message. */
  readonly permissionRequestId: string;
  /** Run the request belongs to. */
  readonly runId: string;
  /** Agent that triggered the operation. */
  readonly agentName: string;
  /** Tool that triggered the operation, if known. */
  readonly toolName?: string;
  /** Category of operation. */
  readonly operation: "fs.read" | "fs.write" | "fs.exec";
  /** Absolute resource path or identifier. */
  readonly resource: string;
}

/**
 * A pending question/feedback request from the daemon — mirrors the wire fields
 * the TUI needs to render the `QuestionPrompt`.
 */
export interface PendingQuestionRequest {
  /** Correlates with the `request_question` message. */
  readonly questionRequestId: string;
  /** Run the request belongs to. */
  readonly runId: string;
  /** Agent that triggered the operation. */
  readonly agentName: string;
  /** Tool that triggered the operation. */
  readonly toolName: string;
  /** The question asked. */
  readonly question: string;
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

/** A single chat run's state — 1:1 with a strategy run. */
export interface ChatRun {
  /** Stable TUI-local id, generated at create-time. */
  readonly id: ChatRunId;
  /** Run id assigned by the daemon after `strategy_started`. */
  readonly daemonRunId: string | null;
  /** Human-readable label (strategy name or file path). */
  readonly label: string;
  /** Path to the strategy file being run. */
  readonly strategyPath: string | null;
  /**
   * Name of the strategy used for this run, when known. Populated for
   * persisted runs hydrated via `loadPersistedRun`. Live runs started
   * via `startStrategy` learn this from `strategy_started` (where it lives
   * on `label` instead). May be null until the daemon reports it.
   */
  readonly strategyName: string | null;
  /**
   * True when this run was hydrated from a persisted snapshot rather
   * than bound to a live daemon run. Read-only — input/permission UIs are
   * disabled by consumers when this flag is set.
   */
  readonly readOnly: boolean;
  /** UI lifecycle status (see `ChatStatus`). */
  readonly status: ChatStatus;
  /** Mirror of the daemon's `RunStatus` for this run, if known. */
  readonly runStatus: RunStatus | null;
  /** Latest error message, or null. */
  readonly error: string | null;
  /** Agent currently waiting for user input, or null. */
  readonly pendingInputAgent: string | null;
  /**
   * Queue of permission requests awaiting user decisions.
   * The head (index 0) is the currently-displayed prompt.
   * When the user resolves it, the next item (if any) is shown immediately.
   */
  readonly pendingPermissionRequests: readonly PendingPermissionRequest[];
  /** Queue of question/feedback requests awaiting user answers. */
  readonly pendingQuestionRequests: readonly PendingQuestionRequest[];
  /** Accumulated messages for this run. */
  readonly messages: readonly ChatMessage[];
  /** Stack of active `launch_strategy` tool-call ids for nested strategy output. */
  readonly activeLaunchStrategyIds: readonly string[];
  /** Creation timestamp (ms since epoch). */
  readonly createdAt: number;
  /** Last-updated timestamp (ms since epoch). */
  readonly updatedAt: number;
}

/** Initial overrides accepted by `createChatRun`. */
export interface CreateRunInit {
  /** Human-readable label. Defaults to "New run". */
  readonly label?: string;
  /** Strategy file path, if known at creation time. */
  readonly strategyPath?: string;
}

/** Lightweight metadata for a daemon-persisted run (from `run_list`). */
export type PersistedRunMeta = RunOverview;

/** Value exposed by `ChatRunsContext`. */
export interface ChatRunsContextType {
  /** All runs keyed by `ChatRunId`. */
  readonly chatRuns: ReadonlyMap<ChatRunId, ChatRun>;
  /** Id of the run currently in view, or null. */
  readonly activeChatRunId: ChatRunId | null;
  /** Change the active run. */
  readonly setActiveChatRunId: (id: ChatRunId | null) => void;
  /** Create a run in `idle` state. Returns its id. Does not make it active. */
  readonly createChatRun: (init?: CreateRunInit) => ChatRunId;
  /** Create a run, start a strategy on it, and make it active. Returns its id. */
  readonly startStrategy: (
    strategyPath: string,
    input?: string,
    cwd?: string,
    manifestPath?: string,
  ) => ChatRunId;
  /** Send user input for a specific run. No-op if no daemon run or no pending input. */
  readonly sendInput: (chatRunId: ChatRunId, text: string) => void;
  /**
   * Queue a steering message for a running run. No-op unless the run is
   * live and running/pending. The daemon merges the text into the next
   * agent turn.
   */
  readonly sendSteer: (chatRunId: ChatRunId, text: string) => void;
  /**
   * Continue a finished run with a new prompt, optionally switching to a
   * different strategy. No-op without a bound daemon run.
   */
  readonly continueChatRun: (
    chatRunId: ChatRunId,
    input: string,
    strategyPath?: string,
  ) => void;
  /** Resolve the head permission request for a specific run. */
  readonly sendPermissionDecision: (
    chatRunId: ChatRunId,
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  /** Resolve the head question request for a specific run. */
  readonly sendQuestionResponse: (
    chatRunId: ChatRunId,
    response: string,
  ) => void;
  /** Send `stop_strategy` for a specific run. No-op without a bound daemon run. */
  readonly stopChatRun: (chatRunId: ChatRunId) => void;
  /** Reset a run to `idle`, clearing messages and pending state. */
  readonly resetChatRun: (chatRunId: ChatRunId) => void;
  /** Remove a run from the map entirely. */
  readonly removeChatRun: (chatRunId: ChatRunId) => void;
  /** Persisted run summaries fetched from the daemon via `list_runs`. */
  readonly persistedRuns: readonly RunOverview[];
  /** Trigger a fresh `list_runs` request. */
  readonly fetchPersistedRuns: (cwd?: string) => void;
  /** Load a persisted run from the daemon by its run id. */
  readonly loadPersistedRun: (runId: string) => void;
  /** Resume a previously stopped/interrupted run by its run id. */
  readonly resumeRun: (runId: string) => void;
  /** Whether a run is currently being loaded from the daemon. */
  readonly isLoadingRun: boolean;
}

/** Props for the `ChatRunsContextProvider` component. */
export interface ChatRunsContextProviderProps {
  /** Child elements that can consume chat run state. */
  readonly children: React.ReactNode;
}

/**
 * Value returned by `useChat()` — a view of a single run with bound action methods.
 *
 * When the resolved run id is `null` (no run exists yet, or the
 * provided `chatRunId` doesn't match any run), all fields return
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
  /** Whether this run is a read-only replay (no live run). */
  readonly readOnly: boolean;
  /** Current pending permission request (head of queue), or null. */
  readonly pendingPermissionRequest: PendingPermissionRequest | null;
  /** Current pending question request (head of queue), or null. */
  readonly pendingQuestionRequest: PendingQuestionRequest | null;
  /** Alias for `daemonRunId` — preserved for back-compatibility. */
  readonly runId: string | null;
  /** Current daemon WebSocket connection status. */
  readonly connectionStatus: WebSocketStatus;
  /** Create a new run and start a strategy on it. Returns the new run id. */
  readonly startStrategy: (
    strategyPath: string,
    input?: string,
    cwd?: string,
    manifestPath?: string,
  ) => ChatRunId;
  /** Resume a previously stopped/cancelled/interrupted run. */
  readonly resumeRun: (runId: string) => void;
  /** Send user input to the bound run. No-op if no run or no pending input. */
  readonly sendInput: (text: string) => void;
  /**
   * Queue a steering message for the bound run. No-op unless the run is
   * live and running/pending.
   */
  readonly sendSteer: (text: string) => void;
  /**
   * Continue the bound run with a new prompt, optionally switching strategy.
   * No-op if no bound daemon run.
   */
  readonly continueRun: (input: string, strategyPath?: string) => void;
  /** Resolve the pending permission request for the bound run. */
  readonly sendPermissionDecision: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  /** Resolve the pending question request for the bound run. */
  readonly sendQuestionResponse: (response: string) => void;
  /** Clear the bound run's UI projection. No-op if no run. */
  readonly reset: () => void;
  /** Send `stop_strategy` for the bound run. No-op if no run or no daemon run. */
  readonly stop: () => void;
}

/** Re-export of the daemon's `RunSummary` for future `list_strategies` hydration. */
export type { RunOverview, RunStatus, RunSummary };
