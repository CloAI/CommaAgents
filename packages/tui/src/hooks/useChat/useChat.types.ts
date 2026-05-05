import type { RunStatus, RunSummary } from "@comma-agents/daemon";

import type { DaemonMessageOf } from "../useDaemon/useDaemon.types";

import type { WebSocketStatus } from "../useWebSocket/useWebSocket.types";

/** Local identifier for a chat session (UUID, stable for the session's life). */
export type ChatSessionId = string;

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
      readonly toolName: string;
      /** Raw JSON-encoded arguments string from the wire protocol. */
      readonly args: string;
    }
  | {
      readonly type: "tool-result";
      readonly toolName: string;
      readonly output: string;
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
 * UI lifecycle status for a chat session.
 *
 * Extends the daemon's `RunStatus` union (`pending | running | completed |
 * error | cancelled`) with TUI-only states that the daemon does not model:
 * - `idle` — session exists but hasn't started a run yet.
 * - `waiting_input` — derived from an unanswered `request_input`.
 * - `waiting_permission` — derived from an unanswered `request_permission`.
 */
export type ChatStatus = RunStatus | "idle" | "waiting_input" | "waiting_permission";

/** A single chat session's state — 1:1 with a strategy run. */
export interface ChatSession {
  /** Stable TUI-local id, generated at create-time. */
  readonly id: ChatSessionId;
  /** Run id assigned by the daemon after `strategy_started`. */
  readonly daemonRunId: string | null;
  /** Human-readable label (strategy name or file path). */
  readonly label: string;
  /** Path to the strategy file being run. */
  readonly strategyPath: string | null;
  /**
   * Name of the strategy used for this run, when known. Populated for
   * persisted sessions hydrated via `loadSession`. Live sessions started
   * via `startStrategy` learn this from `strategy_started` (where it lives
   * on `label` instead). May be null until the daemon reports it.
   */
  readonly strategyName: string | null;
  /**
   * True when this session was hydrated from a persisted snapshot rather
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
  /** Accumulated messages for this session. */
  readonly messages: readonly ChatMessage[];
  /** Creation timestamp (ms since epoch). */
  readonly createdAt: number;
  /** Last-updated timestamp (ms since epoch). */
  readonly updatedAt: number;
}

/** Initial overrides accepted by `createSession`. */
export interface CreateSessionInit {
  /** Human-readable label. Defaults to "New session". */
  readonly label?: string;
  /** Strategy file path, if known at creation time. */
  readonly strategyPath?: string;
}

/** Value exposed by `ChatSessionsContext`. */
export interface ChatSessionsContextType {
  /** All sessions keyed by `ChatSessionId`. */
  readonly sessions: ReadonlyMap<ChatSessionId, ChatSession>;
  /** Id of the session currently in view, or null. */
  readonly activeSessionId: ChatSessionId | null;
  /** Change the active session. */
  readonly setActiveSessionId: (id: ChatSessionId | null) => void;
  /** Create a session in `idle` state. Returns its id. Does not make it active. */
  readonly createSession: (init?: CreateSessionInit) => ChatSessionId;
  /** Create a session, start a strategy on it, and make it active. Returns its id. */
  readonly startStrategy: (strategyPath: string, input?: string, cwd?: string) => ChatSessionId;
  /**
   * Hydrate a persisted session from a daemon `session_loaded` payload.
   *
   * Creates a new local session, projects the persisted turns into
   * `ChatMessage`s (one user + one agent message per turn), marks the
   * session as `readOnly` (no live daemon run), sets it active, and
   * returns its id. Subsequent `sendInput`/`stopSession` calls are no-ops.
   */
  readonly loadSession: (payload: DaemonMessageOf<"session_loaded">) => ChatSessionId;
  /** Send user input into a session that is waiting for it. No-op otherwise. */
  readonly sendInput: (sessionId: ChatSessionId, text: string) => void;
  /** Resolve a pending permission request for a session. */
  readonly sendPermissionDecision: (
    sessionId: ChatSessionId,
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  /** Send `stop_strategy` for this session's daemon run. No-op if no `daemonRunId`. */
  readonly stopSession: (sessionId: ChatSessionId) => void;
  /** Clear the session's UI projection (messages, error, status → idle). Subscription stays alive. */
  readonly resetSession: (sessionId: ChatSessionId) => void;
  /** Delete the session from the map. Clears `activeSessionId` if it was active. */
  readonly removeSession: (sessionId: ChatSessionId) => void;
}

/** Props for the `ChatSessionsContextProvider` component. */
export interface ChatSessionsContextProviderProps {
  /** Child elements that can consume chat session state. */
  readonly children: React.ReactNode;
}

/**
 * Value returned by `useChat()` — a view of a single session with bound action methods.
 *
 * When the resolved session id is `null` (no session exists yet, or the
 * provided `sessionId` doesn't match any session), all fields return
 * empty/null values and action methods other than `startStrategy` are no-ops.
 */
export interface UseChatState {
  /** Id of the session this view is bound to, or null. */
  readonly sessionId: ChatSessionId | null;
  readonly messages: readonly ChatMessage[];
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  /** Name of the strategy that produced this session, if known. */
  readonly strategyName: string | null;
  /** Strategy file path, if known. */
  readonly strategyPath: string | null;
  /** Whether this session is a read-only replay (no live run). */
  readonly readOnly: boolean;
  /** Current pending permission request (head of queue), or null. */
  readonly pendingPermissionRequest: PendingPermissionRequest | null;
  /** Alias for `daemonRunId` — preserved for back-compatibility. */
  readonly runId: string | null;
  /** Current daemon WebSocket connection status. */
  readonly connectionStatus: WebSocketStatus;
  /** Create a new session and start a strategy on it. Returns the new session id. */
  readonly startStrategy: (strategyPath: string, input?: string, cwd?: string) => ChatSessionId;
  /** Send user input to the bound session. No-op if no session or no pending input. */
  readonly sendInput: (text: string) => void;
  /** Resolve the pending permission request for the bound session. */
  readonly sendPermissionDecision: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  /** Clear the bound session's UI projection. No-op if no session. */
  readonly reset: () => void;
  /** Send `stop_strategy` for the bound session. No-op if no session or no daemon run. */
  readonly stop: () => void;
}

/** Re-export of the daemon's `RunSummary` for future `list_strategies` hydration. */
export type { RunStatus, RunSummary };
