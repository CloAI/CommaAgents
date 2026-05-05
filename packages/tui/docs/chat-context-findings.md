# useChat → Global ChatSessions Context

## Goal

Replace the single-caller `useChat` hook with a provider-backed, in-memory
map of chat sessions. Multiple sessions can coexist and keep receiving
daemon events for the life of the process. No persistence.

## Non-goals (v1)

- Disk persistence
- `list_strategies` hydration on mount
- Capturing `agent_streaming.done` result/usage data
- Multi-session UX (tabs, switcher) — plumbing only

---

## Locked decisions

| Topic | Decision |
|---|---|
| Session granularity | 1 session = 1 strategy run |
| `reset()` | Clears UI projection only; subscription + daemon run untouched |
| `stop()` | New method; sends `stop_strategy` for the session's `daemonRunId` |
| Multi-session | Provider holds `Map<ChatSessionId, ChatSession>` + `activeSessionId` |
| `list_strategies` | Deferred |
| Unroutable events (`error`, `pong`, `strategy_list`) | Routed to `activeSessionId`; dropped if none |
| `useChatSessions()` | Yes — exposes full map + active id |
| Local id format | `crypto.randomUUID()` |
| `startStrategy` when one is already active | Create a new session, make it active |
| Type alignment | Import `RunStatus` / `RunSummary` from `@comma-agents/daemon`. No redeclaration. |

---

## Protocol reference (verified)

### Client → Daemon
| Type | Fields | Notes |
|---|---|---|
| `start_strategy` | `strategyPath`, `input?`, `modelOverride?` | Auto-subscribes the sender |
| `stop_strategy` | `runId` | |
| `user_input` | `runId`, `agentName`, `text` | |
| `subscribe` / `unsubscribe` | `runId` | Only needed to attach to others' runs |
| `list_strategies` | — | Deferred |
| `ping` | — | |

### Daemon → Client
| Type | Has `runId`? |
|---|---|
| `strategy_started`, `step_started`, `step_completed`, `agent_streaming`, `agent_output`, `request_input`, `strategy_completed`, `strategy_error` | Yes |
| `strategy_list`, `pong`, `error` | No |

### Key semantics
- `broadcast(runId, …)` on the daemon only sends to `runId` subscribers (`server.ts:44`).
- `start_strategy` auto-subscribes the sender (`executor.ts:348`). We never need to send `subscribe` for our own runs.

---

## Types (`useChat.types.ts`)

```ts
import type { RunStatus } from "@comma-agents/daemon";

export type ChatSessionId = string;

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly sender: string;
  readonly text: string;
  readonly streaming: boolean;
  readonly timestamp: number;
}

/** UI lifecycle status. Extends daemon RunStatus with TUI-only states. */
export type ChatStatus = RunStatus | "idle" | "waiting_input";

export interface ChatSession {
  readonly id: ChatSessionId;
  readonly daemonRunId: string | null;
  readonly label: string;
  readonly strategyPath: string | null;
  readonly status: ChatStatus;
  readonly runStatus: RunStatus | null;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  readonly messages: readonly ChatMessage[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ChatSessionsContextType {
  readonly sessions: ReadonlyMap<ChatSessionId, ChatSession>;
  readonly activeSessionId: ChatSessionId | null;
  readonly setActiveSessionId: (id: ChatSessionId | null) => void;
  readonly createSession: (init?: { label?: string; strategyPath?: string }) => ChatSessionId;
  readonly startStrategy: (strategyPath: string, input?: string) => ChatSessionId;
  readonly sendInput: (sessionId: ChatSessionId, text: string) => void;
  readonly stopSession: (sessionId: ChatSessionId) => void;
  readonly resetSession: (sessionId: ChatSessionId) => void;
  readonly removeSession: (sessionId: ChatSessionId) => void;
}

/** Value returned by useChat() — scoped to one session. */
export interface UseChatState {
  readonly sessionId: ChatSessionId | null;
  readonly messages: readonly ChatMessage[];
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly pendingInputAgent: string | null;
  readonly runId: string | null;
  readonly connectionStatus: WebSocketStatus;
  readonly startStrategy: (strategyPath: string, input?: string) => ChatSessionId;
  readonly sendInput: (text: string) => void;
  readonly reset: () => void;
  readonly stop: () => void;
}
```

---

## Provider contract (`useChat.context.tsx`)

### Ownership
- A single `<ChatSessionsProvider>` at the root owns the session map.
- Registers exactly one `useDaemonSubscription` per daemon message type — no `runId` filter. Routing is internal.

### Session creation
- `createSession({ label?, strategyPath? })` → inserts an `"idle"` session with `daemonRunId: null`, returns its id.
- `startStrategy(strategyPath, input?)` → creates a new session with `status: "running"`, `strategyPath` set, `daemonRunId: null`, sends `start_strategy` to the daemon, sets it as active, returns its id. If the daemon send fails, session status becomes `"error"`.

### Event routing
| Incoming type | Rule |
|---|---|
| `strategy_started` | Match by "session with `daemonRunId === null` and `status === "running"`", most recent by `createdAt`. Set `daemonRunId`, `runStatus: "running"`, append system message `'Strategy "{name}" started (agents: {…})'`. |
| `step_started` / `step_completed` | Look up by `daemonRunId`. Append system message `[stepName] started|completed`. |
| `agent_streaming` | Look up by `daemonRunId`. `event.type === "text"` → append-or-update last streaming message from that agent. `event.type === "done"` → mark that message `streaming: false`. Other event types ignored in v1. |
| `agent_output` | Look up by `daemonRunId`. Append non-streaming agent message. |
| `request_input` | Look up by `daemonRunId`. Set `pendingInputAgent`, `status: "waiting_input"`. If `prompt` present, append as system message. |
| `strategy_completed` | Look up by `daemonRunId`. Set `status: "completed"`, `runStatus: "completed"`. Append system "Strategy completed." |
| `strategy_error` | Look up by `daemonRunId`. Set `status: "error"`, `runStatus: "error"`, `error = message.error.message`. Append system error. |
| `error` (no runId) | Route to `activeSessionId`. Set its `status: "error"`, `error = message.message`. Drop if no active session. |
| `pong`, `strategy_list` | Ignored in v1. |

Sessions whose `daemonRunId` doesn't match are not touched. Drops are silent.

### Mutation methods
- `sendInput(id, text)` — no-op if session has no `daemonRunId` or no `pendingInputAgent`. Appends user message, sends `user_input`, clears `pendingInputAgent`, sets `status: "running"`.
- `stopSession(id)` — no-op if no `daemonRunId`. Sends `stop_strategy`. Does not mutate session state — the daemon will emit `strategy_error` / `strategy_completed` with `cancelled` status.
- `resetSession(id)` — clears `messages`, `error`, `pendingInputAgent`; sets `status: "idle"`. Leaves `daemonRunId`, `runStatus` intact. Daemon events still route to this session.
- `removeSession(id)` — deletes from map. If it was active, `activeSessionId` becomes `null`.

### Message IDs
Per-session counter stored on the session (or prefix-scoped UUIDs — pick simplest: `${sessionId}-${counter}` held in a provider-level `Map<sessionId, number>` ref).

---

## Consumer hooks

### `useChat(sessionId?)` (`useChat.ts`)
- Resolves `id = sessionId ?? activeSessionId`.
- Returns `UseChatState` built from the session (or an "empty" state if `id === null`).
- `startStrategy` on the returned state always creates a new session (it doesn't "start on this session") and returns the new id.
- `sendInput`, `reset`, `stop` operate on the resolved session id; no-op if null.

### `useChatSessions()` (`useChatSessions.ts`)
Returns `{ sessions, activeSessionId, setActiveSessionId }` from the context directly.

---

## File layout (target)

```
packages/tui/src/hooks/useChat/
├── useChat.ts              # useChat(sessionId?) consumer hook
├── useChat.context.tsx     # <ChatSessionsProvider>, ChatSessionsContext
├── useChat.types.ts        # All types
├── useChatSessions.ts      # useChatSessions() consumer hook
├── useChat.test.ts         # Updated to wrap in provider
├── useChat.context.test.ts # Provider routing tests
└── index.ts                # New barrel
```

`main.tsx` wraps `<App>` in `<ChatSessionsProvider>` inside `<DaemonProvider>`.

`hooks/index.ts` exports `ChatSessionsProvider`, `useChat`, `useChatSessions`, plus all the types above.

---

## Implementation order

1. Rewrite `useChat.types.ts` with the types above.
2. Create `useChat.context.tsx` with provider, subscriptions, and routing rules.
3. Create `useChat.ts` (thin consumer) and `useChatSessions.ts`.
4. Create `useChat/index.ts` barrel; update `hooks/index.ts`.
5. Mount `<ChatSessionsProvider>` in `main.tsx`.
6. Verify `app.tsx` still compiles and works without changes (it should — `UseChatState` shape preserved).
7. Rewrite `useChat.test.ts` — wrap in provider; add cases for `stop()`, two concurrent sessions, event routing by `daemonRunId`.
8. Remove module-level `nextMessageId` counter from the old `useChat.ts`.
