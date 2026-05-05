import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, useCallback, useMemo, useRef, useState } from "react";

import { useDaemonCommand } from "../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { DaemonMessageOf } from "../useDaemon/useDaemon.types";
import type {
  ChatMessage,
  ChatSession,
  ChatSessionId,
  ChatSessionsContextProviderProps,
  ChatSessionsContextType,
  CreateSessionInit,
  MessageSegment,
  PendingPermissionRequest,
} from "./useChat.types";

export const ChatSessionsContext = createContext<ChatSessionsContextType | null>(null);

/** Diagnostic log file — bypasses console interception so writes always land. */
const DEBUG_FILE = join(tmpdir(), "comma-agents-chat-debug.log");
function debugLog(tag: string, payload: unknown): void {
  try {
    const ts = new Date().toISOString();
    appendFileSync(DEBUG_FILE, `[${ts}] ${tag} ${JSON.stringify(payload)}\n`);
  } catch {
    // ignore
  }
}
debugLog("[useChat] module loaded", { pid: process.pid, file: DEBUG_FILE });

/** Error code emitted when the daemon WebSocket is unreachable on start. */
const DAEMON_UNREACHABLE_ERROR =
  "Cannot reach daemon — is it running? Start it with: bun run daemon";

/** Derive a human-readable label from a strategy file path. */
function deriveLabelFromPath(strategyPath: string): string {
  const segments = strategyPath.split("/");
  const fileName = segments[segments.length - 1] ?? strategyPath;
  return fileName.replace(/\.(json|yaml|yml)$/u, "");
}

/** Construct a fresh session in idle state. */
function createInitialSession(id: ChatSessionId, init: CreateSessionInit): ChatSession {
  const now = Date.now();
  return {
    id,
    daemonRunId: null,
    label: init.label ?? (init.strategyPath ? deriveLabelFromPath(init.strategyPath) : "New session"),
    strategyPath: init.strategyPath ?? null,
    strategyName: null,
    readOnly: false,
    status: "idle",
    runStatus: null,
    error: null,
    pendingInputAgent: null,
    pendingPermissionRequests: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Global provider for chat sessions.
 *
 * Owns a `Map<ChatSessionId, ChatSession>` plus the currently active session
 * id. Subscribes once to every daemon message type and routes incoming
 * messages to the correct session by `daemonRunId`. Messages without a
 * `runId` (generic `error`, etc.) are routed to the active session.
 *
 * Must be mounted inside a `<DaemonProvider>`.
 */
export function ChatSessionsContextProvider(
  props: ChatSessionsContextProviderProps,
): React.ReactElement {
  const { children } = props;

  const [sessions, setSessions] = useState<ReadonlyMap<ChatSessionId, ChatSession>>(
    () => new Map(),
  );
  const [activeSessionId, setActiveSessionId] = useState<ChatSessionId | null>(null);

  /** Per-session message id counter, kept in a ref to avoid re-renders. */
  const messageCountersRef = useRef<Map<ChatSessionId, number>>(new Map());

  /** Latest `activeSessionId` accessible inside subscription callbacks. */
  const activeSessionIdRef = useRef<ChatSessionId | null>(null);
  activeSessionIdRef.current = activeSessionId;

  const startStrategyCommand = useDaemonCommand("start_strategy");
  const sendUserInputCommand = useDaemonCommand("user_input");
  const stopStrategyCommand = useDaemonCommand("stop_strategy");
  const permissionDecisionCommand = useDaemonCommand("permission_decision");

  // -- Mutation helpers --

  /**
   * Apply an update to a specific session, producing a new map.
   * If the session does not exist, the map is returned unchanged.
   */
  const updateSession = useCallback(
    (
      sessionId: ChatSessionId,
      updater: (session: ChatSession) => ChatSession,
    ): void => {
      setSessions((previousSessions) => {
        const existing = previousSessions.get(sessionId);
        if (!existing) return previousSessions;
        const updated = updater(existing);
        if (updated === existing) return previousSessions;
        const next = new Map(previousSessions);
        next.set(sessionId, { ...updated, updatedAt: Date.now() });
        return next;
      });
    },
    [],
  );

  /**
   * Locate the session whose `daemonRunId` matches `runId`.
   * Reads the latest state via a functional setter trick to avoid stale closures.
   */
  const findSessionIdByRunId = useCallback(
    (sessionsMap: ReadonlyMap<ChatSessionId, ChatSession>, runId: string): ChatSessionId | null => {
      for (const session of sessionsMap.values()) {
        if (session.daemonRunId === runId) return session.id;
      }
      return null;
    },
    [],
  );

  // -- Daemon subscriptions --

  useDaemonSubscription("strategy_started", (message) => {
    setSessions((previousSessions) => {
      // Find the most recently created session that's waiting to bind to a run.
      let pendingSession: ChatSession | null = null;
      for (const session of previousSessions.values()) {
        if (
          session.daemonRunId === null &&
          session.status === "running" &&
          (pendingSession === null || session.createdAt > pendingSession.createdAt)
        ) {
          pendingSession = session;
        }
      }
      if (!pendingSession) return previousSessions;

      const next = new Map(previousSessions);
      const agentsList = message.agents.join(", ");
      const systemMessage: ChatMessage = {
        id: `${pendingSession.id}-msg-${(messageCountersRef.current.get(pendingSession.id) ?? 0) + 1}`,
        role: "system",
        sender: "system",
        text: `Strategy "${message.strategyName}" started (agents: ${agentsList})`,
        streaming: false,
        timestamp: Date.now(),
      };
      messageCountersRef.current.set(
        pendingSession.id,
        (messageCountersRef.current.get(pendingSession.id) ?? 0) + 1,
      );

      next.set(pendingSession.id, {
        ...pendingSession,
        daemonRunId: message.runId,
        runStatus: "running",
        label: message.strategyName,
        strategyName: message.strategyName,
        messages: [...pendingSession.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("step_started", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) return previousSessions;
      const session = previousSessions.get(sessionId)!;
      const counter = (messageCountersRef.current.get(sessionId) ?? 0) + 1;
      messageCountersRef.current.set(sessionId, counter);
      const systemMessage: ChatMessage = {
        id: `${sessionId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `[${message.stepName}] started`,
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousSessions);
      next.set(sessionId, {
        ...session,
        messages: [...session.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("step_completed", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) return previousSessions;
      const session = previousSessions.get(sessionId)!;
      const next = new Map(previousSessions);
      const systemMessage: ChatMessage = {
        id: `${sessionId}-msg-${(messageCountersRef.current.get(sessionId) ?? 0) + 1}`,
        role: "system",
        sender: "system",
        text: `[${message.stepName}] completed`,
        streaming: false,
        timestamp: Date.now(),
      };
      messageCountersRef.current.set(
        sessionId,
        (messageCountersRef.current.get(sessionId) ?? 0) + 1,
      );
      next.set(sessionId, {
        ...session,
        messages: [...session.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("agent_streaming", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) return previousSessions;
      const session = previousSessions.get(sessionId)!;

      // Locate (or create) the in-flight agent message for this agent. We
      // group all streaming events (text, tool-call, tool-result, ...) for
      // an agent's turn into a single message with ordered segments, so
      // the UI can render tool calls inline with the prose.
      const lastAgentIndex = session.messages.findLastIndex(
        (existing) => existing.sender === message.agentName && existing.streaming,
      );

      debugLog("[useChat] agent_streaming event", {
        sessionId,
        runId: message.runId,
        agentName: message.agentName,
        eventType: message.event.type,
        lastAgentIndex,
        totalMessages: session.messages.length,
      });

      const ensureAgentMessage = (
        currentMessages: readonly ChatMessage[],
      ): { messages: ChatMessage[]; index: number } => {
        const mutable = [...currentMessages];
        if (lastAgentIndex >= 0) {
          return { messages: mutable, index: lastAgentIndex };
        }
        const counter = (messageCountersRef.current.get(sessionId) ?? 0) + 1;
        messageCountersRef.current.set(sessionId, counter);
        const fresh: ChatMessage = {
          id: `${sessionId}-msg-${counter}`,
          role: "agent",
          sender: message.agentName,
          text: "",
          segments: [],
          streaming: true,
          timestamp: Date.now(),
        };
        debugLog("[useChat] agent_streaming creating new in-flight message", {
          messageId: fresh.id,
          agentName: message.agentName,
        });
        mutable.push(fresh);
        return { messages: mutable, index: mutable.length - 1 };
      };

      const appendSegment = (
        existing: ChatMessage,
        segment: MessageSegment,
      ): ChatMessage => {
        const segments = existing.segments ?? [];
        return {
          ...existing,
          segments: [...segments, segment],
        };
      };

      if (message.event.type === "text") {
        const { messages: nextMessages, index } = ensureAgentMessage(session.messages);
        const target = nextMessages[index]!;
        const segments = target.segments ?? [];
        const lastSegment = segments[segments.length - 1];
        let nextSegments: readonly MessageSegment[];
        if (lastSegment?.type === "text" && lastSegment.streaming) {
          // Extend the in-flight text segment so consecutive text deltas are
          // rendered as a single continuous block instead of fragmented spans.
          const updated: MessageSegment = {
            type: "text",
            text: lastSegment.text + message.event.text,
            streaming: true,
          };
          nextSegments = [...segments.slice(0, -1), updated];
        } else {
          nextSegments = [
            ...segments,
            { type: "text", text: message.event.text, streaming: true },
          ];
        }
        nextMessages[index] = {
          ...target,
          text: target.text + message.event.text,
          segments: nextSegments,
        };
        const next = new Map(previousSessions);
        next.set(sessionId, { ...session, messages: nextMessages, updatedAt: Date.now() });
        return next;
      }

      if (message.event.type === "tool-call") {
        const { messages: nextMessages, index } = ensureAgentMessage(session.messages);
        nextMessages[index] = appendSegment(nextMessages[index]!, {
          type: "tool-call",
          toolName: message.event.toolName,
          args: message.event.args,
        });
        const next = new Map(previousSessions);
        next.set(sessionId, { ...session, messages: nextMessages, updatedAt: Date.now() });
        return next;
      }

      if (message.event.type === "tool-result") {
        const { messages: nextMessages, index } = ensureAgentMessage(session.messages);
        nextMessages[index] = appendSegment(nextMessages[index]!, {
          type: "tool-result",
          toolName: message.event.toolName,
          output: message.event.output,
        });
        const next = new Map(previousSessions);
        next.set(sessionId, { ...session, messages: nextMessages, updatedAt: Date.now() });
        return next;
      }

      if (message.event.type === "thinking-start") {
        const { messages: nextMessages, index } = ensureAgentMessage(session.messages);
        const target = nextMessages[index]!;
        const segments = target.segments ?? [];
        nextMessages[index] = {
          ...target,
          segments: [
            ...segments,
            { type: "thinking", id: message.event.id, text: "", streaming: true },
          ],
        };
        const next = new Map(previousSessions);
        next.set(sessionId, { ...session, messages: nextMessages, updatedAt: Date.now() });
        return next;
      }

      if (message.event.type === "thinking") {
        const eventId = message.event.id;
        const eventText = message.event.text;
        const { messages: nextMessages, index } = ensureAgentMessage(session.messages);
        const target = nextMessages[index]!;
        const segments = target.segments ?? [];
        // Find the open thinking segment with this id (most recent match wins
        // if the model reuses ids — that should not happen but is harmless).
        const thinkingIndex = segments.findLastIndex(
          (segment) =>
            segment.type === "thinking" && segment.id === eventId && segment.streaming,
        );
        let nextSegments: readonly MessageSegment[];
        if (thinkingIndex >= 0) {
          const existing = segments[thinkingIndex] as Extract<
            MessageSegment,
            { type: "thinking" }
          >;
          const updated: MessageSegment = {
            type: "thinking",
            id: existing.id,
            text: existing.text + eventText,
            streaming: true,
          };
          nextSegments = [
            ...segments.slice(0, thinkingIndex),
            updated,
            ...segments.slice(thinkingIndex + 1),
          ];
        } else {
          // Delta arrived without a preceding `thinking-start`; open one
          // implicitly so no tokens are dropped.
          nextSegments = [
            ...segments,
            {
              type: "thinking",
              id: eventId,
              text: eventText,
              streaming: true,
            },
          ];
        }
        nextMessages[index] = { ...target, segments: nextSegments };
        const next = new Map(previousSessions);
        next.set(sessionId, { ...session, messages: nextMessages, updatedAt: Date.now() });
        return next;
      }

      if (message.event.type === "thinking-end") {
        const eventId = message.event.id;
        const { messages: nextMessages, index } = ensureAgentMessage(session.messages);
        const target = nextMessages[index]!;
        const segments = target.segments ?? [];
        const thinkingIndex = segments.findLastIndex(
          (segment) =>
            segment.type === "thinking" && segment.id === eventId && segment.streaming,
        );
        if (thinkingIndex < 0) {
          return previousSessions;
        }
        const existing = segments[thinkingIndex] as Extract<
          MessageSegment,
          { type: "thinking" }
        >;
        const closed: MessageSegment = { ...existing, streaming: false };
        nextMessages[index] = {
          ...target,
          segments: [
            ...segments.slice(0, thinkingIndex),
            closed,
            ...segments.slice(thinkingIndex + 1),
          ],
        };
        const next = new Map(previousSessions);
        next.set(sessionId, { ...session, messages: nextMessages, updatedAt: Date.now() });
        return next;
      }

      if (message.event.type === "done") {
        debugLog("[useChat] agent_streaming done", {
          sessionId,
          runId: message.runId,
          agentName: message.agentName,
          lastAgentIndex,
          totalMessages: session.messages.length,
          lastAgentTextLength:
            lastAgentIndex >= 0 ? session.messages[lastAgentIndex]!.text.length : null,
        });
        if (lastAgentIndex < 0) return previousSessions;
        const mutableMessages = [...session.messages];
        const target = mutableMessages[lastAgentIndex]!;
        const finalSegments = (target.segments ?? []).map<MessageSegment>((segment) =>
          segment.type === "text" || segment.type === "thinking"
            ? { ...segment, streaming: false }
            : segment,
        );
        mutableMessages[lastAgentIndex] = {
          ...target,
          streaming: false,
          segments: finalSegments,
        };
        const next = new Map(previousSessions);
        next.set(sessionId, { ...session, messages: mutableMessages, updatedAt: Date.now() });
        return next;
      }

      // step-start — no UI segment to render.
      return previousSessions;
    });
  });

  useDaemonSubscription("agent_output", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) {
        debugLog("[useChat] agent_output ignored — no session for runId", {
          runId: message.runId,
          agentName: message.agentName,
        });
        return previousSessions;
      }
      const session = previousSessions.get(sessionId)!;

      // If the streaming subscription has already produced a message for this
      // agent (in-flight or finalized) carrying text, `agent_output` is a
      // duplicate of that streamed message and must be skipped. Note: the
      // daemon emits `agent_output` BEFORE the streaming `done` event, so the
      // streamed message is typically still `streaming: true` at this point —
      // we must NOT gate on `!streaming` here.
      const lastAgentIndex = session.messages.findLastIndex(
        (existing) => existing.role === "agent" && existing.sender === message.agentName,
      );
      const lastAgentMessage = lastAgentIndex >= 0 ? session.messages[lastAgentIndex]! : null;
      debugLog("[useChat] agent_output received", {
        sessionId,
        runId: message.runId,
        agentName: message.agentName,
        outputTextLength: message.text.length,
        outputTextPreview: message.text.slice(0, 80),
        totalMessages: session.messages.length,
        lastAgentIndex,
        lastAgentStreaming: lastAgentMessage?.streaming ?? null,
        lastAgentTextLength: lastAgentMessage?.text.length ?? null,
        lastAgentTextPreview: lastAgentMessage?.text.slice(0, 80) ?? null,
        lastAgentRole: lastAgentMessage?.role ?? null,
        lastAgentSender: lastAgentMessage?.sender ?? null,
      });
      if (lastAgentMessage && lastAgentMessage.text.length > 0) {
        debugLog("[useChat] agent_output skipped — duplicate of streamed message", {});
        return previousSessions;
      }

      debugLog("[useChat] agent_output appending new message (no streamed match)", {});
      const counter = (messageCountersRef.current.get(sessionId) ?? 0) + 1;
      messageCountersRef.current.set(sessionId, counter);
      const agentMessage: ChatMessage = {
        id: `${sessionId}-msg-${counter}`,
        role: "agent",
        sender: message.agentName,
        text: message.text,
        segments: [{ type: "text", text: message.text, streaming: false }],
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousSessions);
      next.set(sessionId, {
        ...session,
        messages: [...session.messages, agentMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("request_input", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) return previousSessions;
      const session = previousSessions.get(sessionId)!;
      let updatedMessages = session.messages;
      if (message.prompt) {
        const counter = (messageCountersRef.current.get(sessionId) ?? 0) + 1;
        messageCountersRef.current.set(sessionId, counter);
        updatedMessages = [
          ...session.messages,
          {
            id: `${sessionId}-msg-${counter}`,
            role: "system",
            sender: "system",
            text: message.prompt,
            streaming: false,
            timestamp: Date.now(),
          },
        ];
      }
      const next = new Map(previousSessions);
      next.set(sessionId, {
        ...session,
        status: "waiting_input",
        pendingInputAgent: message.agentName,
        messages: updatedMessages,
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("strategy_completed", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) return previousSessions;
      const session = previousSessions.get(sessionId)!;
      const counter = (messageCountersRef.current.get(sessionId) ?? 0) + 1;
      messageCountersRef.current.set(sessionId, counter);
      const systemMessage: ChatMessage = {
        id: `${sessionId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: "Strategy completed.",
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousSessions);
      next.set(sessionId, {
        ...session,
        status: "completed",
        runStatus: "completed",
        pendingPermissionRequests: [],
        messages: [...session.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("request_permission", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) return previousSessions;
      const session = previousSessions.get(sessionId)!;
      const newRequest: PendingPermissionRequest = {
        permissionRequestId: message.requestId,
        runId: message.runId,
        agentName: message.agentName,
        toolName: message.toolName,
        operation: message.operation,
        resource: message.resource,
      };
      const next = new Map(previousSessions);
      next.set(sessionId, {
        ...session,
        status: "waiting_permission",
        pendingPermissionRequests: [...session.pendingPermissionRequests, newRequest],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("policy_updated", (_message) => {
    // policy_updated is informational — the sandbox's allow/deny lists changed.
    // We do NOT dequeue pendingPermissionRequests here; sendPermissionDecision
    // already handles the dequeue immediately when the user makes a choice.
    // (Previously this handler dequeued, which caused a double-dequeue for
    // "allow-session"/"deny-session" decisions and silently dropped queued prompts.)
  });

  useDaemonSubscription("strategy_error", (message) => {
    setSessions((previousSessions) => {
      const sessionId = findSessionIdByRunId(previousSessions, message.runId);
      if (!sessionId) return previousSessions;
      const session = previousSessions.get(sessionId)!;
      const counter = (messageCountersRef.current.get(sessionId) ?? 0) + 1;
      messageCountersRef.current.set(sessionId, counter);
      const systemMessage: ChatMessage = {
        id: `${sessionId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `Error: ${message.error.message}`,
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousSessions);
      next.set(sessionId, {
        ...session,
        status: "error",
        runStatus: "error",
        error: message.error.message,
        messages: [...session.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("error", (message) => {
    const targetSessionId = activeSessionIdRef.current;
    if (!targetSessionId) return;
    setSessions((previousSessions) => {
      const session = previousSessions.get(targetSessionId);
      if (!session) return previousSessions;
      const counter = (messageCountersRef.current.get(targetSessionId) ?? 0) + 1;
      messageCountersRef.current.set(targetSessionId, counter);
      const systemMessage: ChatMessage = {
        id: `${targetSessionId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `Error: ${message.message}`,
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousSessions);
      next.set(targetSessionId, {
        ...session,
        status: "error",
        error: message.message,
        messages: [...session.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  // -- Public API --

  const createSession = useCallback(
    (init: CreateSessionInit = {}): ChatSessionId => {
      const id = crypto.randomUUID();
      const session = createInitialSession(id, init);
      setSessions((previousSessions) => {
        const next = new Map(previousSessions);
        next.set(id, session);
        return next;
      });
      return id;
    },
    [],
  );

  const startStrategy = useCallback(
    (strategyPath: string, input?: string, cwd?: string): ChatSessionId => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const session: ChatSession = {
        ...createInitialSession(id, { strategyPath }),
        status: "running",
        createdAt: now,
        updatedAt: now,
      };

      setSessions((previousSessions) => {
        const next = new Map(previousSessions);
        next.set(id, session);
        return next;
      });
      setActiveSessionId(id);

      const requestId = startStrategyCommand({
        strategyPath,
        ...(input !== undefined ? { input } : {}),
        ...(cwd !== undefined ? { cwd } : {}),
      });

      if (!requestId) {
        // Daemon unreachable — flip to error immediately.
        setSessions((previousSessions) => {
          const existing = previousSessions.get(id);
          if (!existing) return previousSessions;
          const next = new Map(previousSessions);
          next.set(id, {
            ...existing,
            status: "error",
            error: DAEMON_UNREACHABLE_ERROR,
            updatedAt: Date.now(),
          });
          return next;
        });
      }

      return id;
    },
    [startStrategyCommand],
  );

  /**
   * Project a `session_loaded` payload into a local `ChatSession`.
   *
   * Each persisted turn becomes two `ChatMessage`s: a `user` message
   * carrying `turn.userMessage` and an `agent` message carrying `turn.text`
   * (with a single non-streaming text segment). Run summaries are surfaced
   * as system messages between turns when their boundaries are detectable
   * via `startedAt`/`completedAt`. The hydrated session is marked `readOnly`
   * so input/permission UIs short-circuit.
   */
  const loadSession = useCallback(
    (payload: DaemonMessageOf<"session_loaded">): ChatSessionId => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const { metadata, turns, runs } = payload;

      // Derive a strategyName/strategyPath from the most recent run, if any.
      // Persisted turns predate any single run so this is best-effort metadata.
      const lastRun = runs.length > 0 ? runs[runs.length - 1]! : null;

      const projected: ChatMessage[] = [];
      let counter = 0;
      const nextId = (): string => {
        counter += 1;
        return `${id}-msg-${counter}`;
      };

      for (const turn of turns) {
        if (turn.userMessage.length > 0) {
          projected.push({
            id: nextId(),
            role: "user",
            sender: "you",
            text: turn.userMessage,
            streaming: false,
            timestamp: Date.parse(turn.startedAt) || now,
          });
        }
        if (turn.text.length > 0) {
          projected.push({
            id: nextId(),
            role: "agent",
            sender: turn.agentName,
            text: turn.text,
            segments: [{ type: "text", text: turn.text, streaming: false }],
            streaming: false,
            timestamp: Date.parse(turn.completedAt) || now,
          });
        }
      }

      const finalRunStatus = lastRun?.status ?? null;
      const baseStatus: ChatSession["status"] =
        finalRunStatus === "error"
          ? "error"
          : finalRunStatus === "cancelled"
            ? "cancelled"
            : finalRunStatus === "completed"
              ? "completed"
              : "idle";

      const session: ChatSession = {
        id,
        daemonRunId: null,
        label: metadata.title ?? lastRun?.strategyName ?? "Loaded session",
        strategyPath: lastRun?.strategyPath ?? null,
        strategyName: lastRun?.strategyName ?? null,
        readOnly: true,
        status: baseStatus,
        runStatus: finalRunStatus,
        error: lastRun?.error?.message ?? null,
        pendingInputAgent: null,
        pendingPermissionRequests: [],
        messages: projected,
        createdAt: now,
        updatedAt: now,
      };

      messageCountersRef.current.set(id, counter);

      setSessions((previousSessions) => {
        const next = new Map(previousSessions);
        next.set(id, session);
        return next;
      });
      setActiveSessionId(id);

      return id;
    },
    [],
  );

  const sendInput = useCallback(
    (sessionId: ChatSessionId, text: string): void => {
      setSessions((previousSessions) => {
        const session = previousSessions.get(sessionId);
        if (!session) return previousSessions;
        if (!session.daemonRunId || !session.pendingInputAgent) return previousSessions;

        const counter = (messageCountersRef.current.get(sessionId) ?? 0) + 1;
        messageCountersRef.current.set(sessionId, counter);
        const userMessage: ChatMessage = {
          id: `${sessionId}-msg-${counter}`,
          role: "user",
          sender: "you",
          text,
          streaming: false,
          timestamp: Date.now(),
        };

        sendUserInputCommand({
          runId: session.daemonRunId,
          agentName: session.pendingInputAgent,
          text,
        });

        const next = new Map(previousSessions);
        next.set(sessionId, {
          ...session,
          messages: [...session.messages, userMessage],
          pendingInputAgent: null,
          status: "running",
          updatedAt: Date.now(),
        });
        return next;
      });
    },
    [sendUserInputCommand],
  );

  const sendPermissionDecision = useCallback(
    (
      sessionId: ChatSessionId,
      decision: "allow" | "deny" | "allow-session" | "deny-session",
    ): void => {
      setSessions((previousSessions) => {
        const session = previousSessions.get(sessionId);
        if (!session || session.pendingPermissionRequests.length === 0 || !session.daemonRunId)
          return previousSessions;

        const head = session.pendingPermissionRequests[0]!;

        permissionDecisionCommand({
          runId: session.daemonRunId,
          permissionRequestId: head.permissionRequestId,
          decision,
        });

        // Dequeue the head. For allow/deny (one-shot), policy_updated won't fire
        // so we clear here. For allow-session/deny-session, policy_updated also
        // dequeues — but dequeuing twice is harmless because the queue is already
        // shorter; in practice policy_updated fires after and finds the head already
        // gone, so it dequeues the next item. To keep it simple: always dequeue here
        // immediately for UX responsiveness.
        const remaining = session.pendingPermissionRequests.slice(1);
        const next = new Map(previousSessions);
        next.set(sessionId, {
          ...session,
          status: remaining.length > 0 ? "waiting_permission" : "running",
          pendingPermissionRequests: remaining,
          updatedAt: Date.now(),
        });
        return next;
      });
    },
    [permissionDecisionCommand],
  );

  const stopSession = useCallback(
    (sessionId: ChatSessionId): void => {
      const session = sessions.get(sessionId);
      if (!session || !session.daemonRunId) return;
      stopStrategyCommand({ runId: session.daemonRunId });
    },
    [sessions, stopStrategyCommand],
  );

  const resetSession = useCallback(
    (sessionId: ChatSessionId): void => {
      updateSession(sessionId, (session) => ({
        ...session,
        messages: [],
        status: "idle",
        error: null,
        pendingInputAgent: null,
        pendingPermissionRequests: [],
        // Clear loaded-session metadata so the host app falls back to its
        // intro/strategy-selection view after a reset.
        strategyName: null,
        strategyPath: null,
        readOnly: false,
      }));
      messageCountersRef.current.set(sessionId, 0);
    },
    [updateSession],
  );

  const removeSession = useCallback(
    (sessionId: ChatSessionId): void => {
      setSessions((previousSessions) => {
        if (!previousSessions.has(sessionId)) return previousSessions;
        const next = new Map(previousSessions);
        next.delete(sessionId);
        return next;
      });
      messageCountersRef.current.delete(sessionId);
      setActiveSessionId((currentActive) =>
        currentActive === sessionId ? null : currentActive,
      );
    },
    [],
  );

  const contextValue = useMemo<ChatSessionsContextType>(
    () => ({
      sessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      startStrategy,
      loadSession,
      sendInput,
      sendPermissionDecision,
      stopSession,
      resetSession,
      removeSession,
    }),
    [
      sessions,
      activeSessionId,
      createSession,
      startStrategy,
      loadSession,
      sendInput,
      sendPermissionDecision,
      stopSession,
      resetSession,
      removeSession,
    ],
  );

  return (
    <ChatSessionsContext.Provider value={contextValue}>{children}</ChatSessionsContext.Provider>
  );
}
