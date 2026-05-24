import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunOverview, RunTurn } from "@comma-agents/daemon";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDaemon } from "../useDaemon/useDaemon";
import type { DaemonMessageOf } from "../useDaemon/useDaemon.types";
import { useDaemonCommand } from "../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type {
  ChatMessage,
  ChatRun,
  ChatRunId,
  ChatRunsContextProviderProps,
  ChatRunsContextType,
  CreateRunInit,
  MessageSegment,
  PendingPermissionRequest,
  PendingQuestionRequest,
} from "./useChat.types";
import { projectRunTurnToMessages } from "./useChat.utils";

export const ChatRunsContext =
  createContext<ChatRunsContextType | null>(null);

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

/** Construct a fresh run in idle state. */
function createInitialChatRun(
  id: ChatRunId,
  init: CreateRunInit,
): ChatRun {
  const now = Date.now();
  return {
    id,
    daemonRunId: null,
    label:
      init.label ??
      (init.strategyPath
        ? deriveLabelFromPath(init.strategyPath)
        : "New run"),
    strategyPath: init.strategyPath ?? null,
    strategyName: null,
    readOnly: false,
    status: "idle",
    runStatus: null,
    error: null,
    pendingInputAgent: null,
    pendingPermissionRequests: [],
    pendingQuestionRequests: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Global provider for chat runs.
 *
 * Owns a `Map<ChatRunId, ChatRun>` plus the currently active run
 * id. Subscribes once to every daemon message type and routes incoming
 * messages to the correct run by `daemonRunId`. Messages without a
 * `runId` (generic `error`, etc.) are routed to the active run.
 *
 * Must be mounted inside a `<DaemonContextProvider>`.
 */
export function ChatRunsContextProvider(
  props: ChatRunsContextProviderProps,
): React.ReactElement {
  const { children } = props;

  const [chatRuns, setChatRuns] = useState<
    ReadonlyMap<ChatRunId, ChatRun>
  >(() => new Map());
  const [activeChatRunId, setActiveChatRunId] = useState<ChatRunId | null>(
    null,
  );

  /** Per-run message id counter, kept in a ref to avoid re-renders. */
  const messageCountersRef = useRef<Map<ChatRunId, number>>(new Map());

  /** Latest `activeChatRunId` accessible inside subscription callbacks. */
  const activeChatRunIdRef = useRef<ChatRunId | null>(null);
  activeChatRunIdRef.current = activeChatRunId;

  const startStrategyCommand = useDaemonCommand("start_strategy");
  const sendUserInputCommand = useDaemonCommand("user_input");
  const stopStrategyCommand = useDaemonCommand("stop_strategy");
  const permissionDecisionCommand = useDaemonCommand("permission_decision");
  const questionResponseCommand = useDaemonCommand("question_response");
  const listRunsCommand = useDaemonCommand("list_runs");
  const getRunCommand = useDaemonCommand("get_run");
  const subscribeCommand = useDaemonCommand("subscribe");
  const resumeRunCommand = useDaemonCommand("resume_run");

  const { status: daemonConnectionStatus } = useDaemon();

  const [persistedRuns, setPersistedRuns] = useState<readonly RunOverview[]>(
    [],
  );
  const [isLoadingRun, setIsLoadingRun] = useState(false);
  const [resumingRunId, setResumingRunId] = useState<string | null>(null);

  useDaemonSubscription("run_list", (message) => {
    setPersistedRuns(message.runs);
  });

  useDaemonSubscription("run_loaded", (message) => {
    setIsLoadingRun(false);
    loadRun(message);
  });

  const fetchPersistedRuns = useCallback(
    (cwd?: string): void => {
      listRunsCommand(cwd !== undefined ? { cwd } : {});
    },
    [listRunsCommand],
  );

  const loadPersistedRun = useCallback(
    (runId: string): void => {
      // If we already have a local ChatRun bound to this daemon run,
      // just switch to it — recreating a read-only copy would sever the
      // live binding and hide the prompt area if the run is waiting for
      // input.
      for (const existingChatRun of chatRuns.values()) {
        if (existingChatRun.daemonRunId === runId) {
          setActiveChatRunId(existingChatRun.id);
          return;
        }
      }
      setIsLoadingRun(true);
      const sent = getRunCommand({ runId });
      if (!sent) {
        setIsLoadingRun(false);
      }
    },
    [chatRuns, getRunCommand],
  );

  const resumeRun = useCallback(
    (runId: string): void => {
      setResumingRunId(runId);
      setIsLoadingRun(true);
      const sent = getRunCommand({ runId });
      if (!sent) {
        setIsLoadingRun(false);
        setResumingRunId(null);
      }
    },
    [getRunCommand],
  );

  useEffect(() => {
    if (daemonConnectionStatus === "connected") {
      fetchPersistedRuns(process.cwd());
    }
  }, [daemonConnectionStatus, fetchPersistedRuns]);

  // -- Mutation helpers --

  /**
   * Apply an update to a specific run, producing a new map.
   * If the run does not exist, the map is returned unchanged.
   */
  const updateChatRun = useCallback(
    (
      chatRunId: ChatRunId,
      updater: (chatRun: ChatRun) => ChatRun,
    ): void => {
      setChatRuns((previousChatRuns) => {
        const existing = previousChatRuns.get(chatRunId);
        if (!existing) return previousChatRuns;
        const updated = updater(existing);
        if (updated === existing) return previousChatRuns;
        const next = new Map(previousChatRuns);
        next.set(chatRunId, { ...updated, updatedAt: Date.now() });
        return next;
      });
    },
    [],
  );

  /**
   * Locate the run whose `daemonRunId` matches `runId`.
   * Reads the latest state via a functional setter trick to avoid stale closures.
   */
  const findChatRunIdByDaemonRunId = useCallback(
    (
      chatRunsMap: ReadonlyMap<ChatRunId, ChatRun>,
      runId: string,
    ): ChatRunId | null => {
      for (const chatRun of chatRunsMap.values()) {
        if (chatRun.daemonRunId === runId) return chatRun.id;
      }
      return null;
    },
    [],
  );

  // -- Daemon subscriptions --

  useDaemonSubscription("strategy_started", (message) => {
    setChatRuns((previousChatRuns) => {
      // Find the most recently created run that's waiting to bind to a run,
      // or an existing run that has been resumed (matches daemonRunId).
      let pendingChatRun: ChatRun | null = null;
      for (const chatRun of previousChatRuns.values()) {
        if (chatRun.daemonRunId === message.runId) {
          pendingChatRun = chatRun;
          break;
        }
      }
      if (!pendingChatRun) {
        for (const chatRun of previousChatRuns.values()) {
          if (
            chatRun.daemonRunId === null &&
            chatRun.status === "running" &&
            (pendingChatRun === null ||
              chatRun.createdAt > pendingChatRun.createdAt)
          ) {
            pendingChatRun = chatRun;
          }
        }
      }
      if (!pendingChatRun) return previousChatRuns;

      const next = new Map(previousChatRuns);
      const agentsList = message.agents.join(", ");
      const systemMessage: ChatMessage = {
        id: `${pendingChatRun.id}-msg-${(messageCountersRef.current.get(pendingChatRun.id) ?? 0) + 1}`,
        role: "system",
        sender: "system",
        text: `Strategy "${message.strategyName}" started (agents: ${agentsList})`,
        streaming: false,
        timestamp: Date.now(),
      };
      messageCountersRef.current.set(
        pendingChatRun.id,
        (messageCountersRef.current.get(pendingChatRun.id) ?? 0) + 1,
      );

      next.set(pendingChatRun.id, {
        ...pendingChatRun,
        daemonRunId: message.runId,
        runStatus: "running",
        label: message.strategyName,
        strategyName: message.strategyName,
        messages: [...pendingChatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("step_started", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `[${message.stepName}] started`,
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousChatRuns);
      next.set(chatRunId, {
        ...chatRun,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("step_completed", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;
      const next = new Map(previousChatRuns);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${(messageCountersRef.current.get(chatRunId) ?? 0) + 1}`,
        role: "system",
        sender: "system",
        text: `[${message.stepName}] completed`,
        streaming: false,
        timestamp: Date.now(),
      };
      messageCountersRef.current.set(
        chatRunId,
        (messageCountersRef.current.get(chatRunId) ?? 0) + 1,
      );
      next.set(chatRunId, {
        ...chatRun,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("agent_streaming", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;

      // Locate (or create) the in-flight agent message for this agent. We
      // group all streaming events (text, tool-call, tool-result, ...) for
      // an agent's turn into a single message with ordered segments, so
      // the UI can render tool calls inline with the prose.
      const lastAgentIndex = chatRun.messages.findLastIndex(
        (existing) =>
          existing.sender === message.agentName && existing.streaming,
      );

      debugLog("[useChat] agent_streaming event", {
        chatRunId,
        runId: message.runId,
        agentName: message.agentName,
        eventType: message.event.type,
        lastAgentIndex,
        totalMessages: chatRun.messages.length,
      });

      const ensureAgentMessage = (
        currentMessages: readonly ChatMessage[],
      ): { messages: ChatMessage[]; index: number } => {
        const mutable = [...currentMessages];
        if (lastAgentIndex >= 0) {
          return { messages: mutable, index: lastAgentIndex };
        }
        const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
        messageCountersRef.current.set(chatRunId, counter);
        const fresh: ChatMessage = {
          id: `${chatRunId}-msg-${counter}`,
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
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
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
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "tool-call") {
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
        nextMessages[index] = appendSegment(nextMessages[index]!, {
          type: "tool-call",
          toolCallId: message.event.toolCallId,
          toolName: message.event.toolName,
          args: message.event.args,
        });
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "tool-result") {
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
        nextMessages[index] = appendSegment(nextMessages[index]!, {
          type: "tool-result",
          toolCallId: message.event.toolCallId,
          toolName: message.event.toolName,
          output: message.event.output,
          status: message.event.status,
          ...(message.event.error !== undefined
            ? { error: message.event.error }
            : {}),
        });
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "thinking-start") {
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
        const target = nextMessages[index]!;
        const segments = target.segments ?? [];
        nextMessages[index] = {
          ...target,
          segments: [
            ...segments,
            {
              type: "thinking",
              id: message.event.id,
              text: "",
              streaming: true,
            },
          ],
        };
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "thinking") {
        const eventId = message.event.id;
        const eventText = message.event.text;
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
        const target = nextMessages[index]!;
        const segments = target.segments ?? [];
        // Find the open thinking segment with this id (most recent match wins
        // if the model reuses ids — that should not happen but is harmless).
        const thinkingIndex = segments.findLastIndex(
          (segment) =>
            segment.type === "thinking" &&
            segment.id === eventId &&
            segment.streaming,
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
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "thinking-end") {
        const eventId = message.event.id;
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
        const target = nextMessages[index]!;
        const segments = target.segments ?? [];
        const thinkingIndex = segments.findLastIndex(
          (segment) =>
            segment.type === "thinking" &&
            segment.id === eventId &&
            segment.streaming,
        );
        if (thinkingIndex < 0) {
          return previousChatRuns;
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
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "done") {
        debugLog("[useChat] agent_streaming done", {
          chatRunId,
          runId: message.runId,
          agentName: message.agentName,
          lastAgentIndex,
          totalMessages: chatRun.messages.length,
          lastAgentTextLength:
            lastAgentIndex >= 0
              ? chatRun.messages[lastAgentIndex]!.text.length
              : null,
        });
        if (lastAgentIndex < 0) return previousChatRuns;
        const mutableMessages = [...chatRun.messages];
        const target = mutableMessages[lastAgentIndex]!;
        const finalSegments = (target.segments ?? []).map<MessageSegment>(
          (segment) =>
            segment.type === "text" || segment.type === "thinking"
              ? { ...segment, streaming: false }
              : segment,
        );
        mutableMessages[lastAgentIndex] = {
          ...target,
          streaming: false,
          segments: finalSegments,
        };
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: mutableMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      // step-start — no UI segment to render.
      return previousChatRuns;
    });
  });

  useDaemonSubscription("agent_output", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) {
        debugLog("[useChat] agent_output ignored — no run for runId", {
          runId: message.runId,
          agentName: message.agentName,
        });
        return previousChatRuns;
      }
      const chatRun = previousChatRuns.get(chatRunId)!;

      // If the streaming subscription has already produced a message for this
      // agent (in-flight or finalized) carrying text, `agent_output` is a
      // duplicate of that streamed message and must be skipped. Note: the
      // daemon emits `agent_output` BEFORE the streaming `done` event, so the
      // streamed message is typically still `streaming: true` at this point —
      // we must NOT gate on `!streaming` here.
      const lastAgentIndex = chatRun.messages.findLastIndex(
        (existing) =>
          existing.role === "agent" && existing.sender === message.agentName,
      );
      const lastAgentMessage =
        lastAgentIndex >= 0 ? chatRun.messages[lastAgentIndex]! : null;
      debugLog("[useChat] agent_output received", {
        chatRunId,
        runId: message.runId,
        agentName: message.agentName,
        outputTextLength: message.text.length,
        outputTextPreview: message.text.slice(0, 80),
        totalMessages: chatRun.messages.length,
        lastAgentIndex,
        lastAgentStreaming: lastAgentMessage?.streaming ?? null,
        lastAgentTextLength: lastAgentMessage?.text.length ?? null,
        lastAgentTextPreview: lastAgentMessage?.text.slice(0, 80) ?? null,
        lastAgentRole: lastAgentMessage?.role ?? null,
        lastAgentSender: lastAgentMessage?.sender ?? null,
      });
      if (lastAgentMessage && lastAgentMessage.text.length > 0) {
        debugLog(
          "[useChat] agent_output skipped — duplicate of streamed message",
          {},
        );
        return previousChatRuns;
      }

      debugLog(
        "[useChat] agent_output appending new message (no streamed match)",
        {},
      );
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const agentMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "agent",
        sender: message.agentName,
        text: message.text,
        segments: [{ type: "text", text: message.text, streaming: false }],
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousChatRuns);
      next.set(chatRunId, {
        ...chatRun,
        messages: [...chatRun.messages, agentMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("request_input", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;
      let updatedMessages = chatRun.messages;
      if (message.prompt) {
        const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
        messageCountersRef.current.set(chatRunId, counter);
        updatedMessages = [
          ...chatRun.messages,
          {
            id: `${chatRunId}-msg-${counter}`,
            role: "system",
            sender: "system",
            text: message.prompt,
            streaming: false,
            timestamp: Date.now(),
          },
        ];
      }
      const next = new Map(previousChatRuns);
      next.set(chatRunId, {
        ...chatRun,
        status: "waiting_input",
        pendingInputAgent: message.agentName,
        messages: updatedMessages,
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("strategy_completed", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: "Strategy completed.",
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousChatRuns);
      next.set(chatRunId, {
        ...chatRun,
        status: "completed",
        runStatus: "completed",
        pendingPermissionRequests: [],
        pendingQuestionRequests: [],
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("request_permission", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;
      const newRequest: PendingPermissionRequest = {
        permissionRequestId: message.requestId,
        runId: message.runId,
        agentName: message.agentName,
        toolName: message.toolName,
        operation: message.operation,
        resource: message.resource,
      };
      const next = new Map(previousChatRuns);
      next.set(chatRunId, {
        ...chatRun,
        status: "waiting_permission",
        pendingPermissionRequests: [
          ...chatRun.pendingPermissionRequests,
          newRequest,
        ],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("request_question", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;
      const newRequest: PendingQuestionRequest = {
        questionRequestId: message.requestId,
        runId: message.runId,
        agentName: message.agentName,
        toolName: message.toolName,
        question: message.question,
      };
      const next = new Map(previousChatRuns);
      next.set(chatRunId, {
        ...chatRun,
        status: "waiting_question",
        pendingQuestionRequests: [
          ...chatRun.pendingQuestionRequests,
          newRequest,
        ],
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
    setChatRuns((previousChatRuns) => {
      const chatRunId = findChatRunIdByDaemonRunId(previousChatRuns, message.runId);
      if (!chatRunId) return previousChatRuns;
      const chatRun = previousChatRuns.get(chatRunId)!;
      const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
      messageCountersRef.current.set(chatRunId, counter);
      const systemMessage: ChatMessage = {
        id: `${chatRunId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `Error: ${message.error.message}`,
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousChatRuns);
      next.set(chatRunId, {
        ...chatRun,
        status: "error",
        runStatus: "error",
        error: message.error.message,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  useDaemonSubscription("error", (message) => {
    const targetSessionId = activeChatRunIdRef.current;
    if (!targetSessionId) return;
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(targetSessionId);
      if (!chatRun) return previousChatRuns;
      const counter =
        (messageCountersRef.current.get(targetSessionId) ?? 0) + 1;
      messageCountersRef.current.set(targetSessionId, counter);
      const systemMessage: ChatMessage = {
        id: `${targetSessionId}-msg-${counter}`,
        role: "system",
        sender: "system",
        text: `Error: ${message.message}`,
        streaming: false,
        timestamp: Date.now(),
      };
      const next = new Map(previousChatRuns);
      next.set(targetSessionId, {
        ...chatRun,
        status: "error",
        error: message.message,
        messages: [...chatRun.messages, systemMessage],
        updatedAt: Date.now(),
      });
      return next;
    });
  });

  // -- Public API --

  const createChatRun = useCallback(
    (init: CreateRunInit = {}): ChatRunId => {
      const id = crypto.randomUUID();
      const chatRun = createInitialChatRun(id, init);
      setChatRuns((previousChatRuns) => {
        const next = new Map(previousChatRuns);
        next.set(id, chatRun);
        return next;
      });
      return id;
    },
    [],
  );

  const startStrategy = useCallback(
    (
      strategyPath: string,
      input?: string,
      cwd?: string,
      manifestPath?: string,
    ): ChatRunId => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const chatRun: ChatRun = {
        ...createInitialChatRun(id, { strategyPath }),
        status: "running",
        createdAt: now,
        updatedAt: now,
      };

      setChatRuns((previousChatRuns) => {
        const next = new Map(previousChatRuns);
        next.set(id, chatRun);
        return next;
      });
      setActiveChatRunId(id);

      const requestId = startStrategyCommand({
        strategyPath,
        ...(input !== undefined ? { input } : {}),
        ...(cwd !== undefined ? { cwd } : {}),
        ...(manifestPath !== undefined ? { manifestPath } : {}),
      });

      if (!requestId) {
        // Daemon unreachable — flip to error immediately.
        setChatRuns((previousChatRuns) => {
          const existing = previousChatRuns.get(id);
          if (!existing) return previousChatRuns;
          const next = new Map(previousChatRuns);
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
   * Project a `run_loaded` payload into a local `ChatRun`.
   *
   * Each persisted turn becomes two `ChatMessage`s: a `user` message
   * carrying `turn.userMessage` and an `agent` message carrying `turn.text`
   * (with a single non-streaming text segment). The hydrated run is
   * marked `readOnly` so input/permission UIs short-circuit.
   */
  const loadRun = useCallback(
    (payload: DaemonMessageOf<"run_loaded">): ChatRunId => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const { runId, strategyName, strategyPath, status, error, turns } =
        payload;

      const projected: ChatMessage[] = [];
      let counter = 0;
      const nextId = (): string => {
        counter += 1;
        return `${id}-msg-${counter}`;
      };

      for (const turn of turns as readonly RunTurn[]) {
        projected.push(...projectRunTurnToMessages(turn, nextId, now));
      }

      // A run is "live" if the daemon still considers it active. For live
      // runs we bind to the daemon (so events route here), skip readOnly,
      // and re-subscribe — the daemon's broadcast sink only fans out to
      // currently-subscribed clients, so this is required for events such
      // as `request_input` to reach the TUI.
      const isResuming = runId === resumingRunId;
      const isLive = status === "pending" || status === "running" || isResuming;

      const baseStatus: ChatRun["status"] =
        status === "error"
          ? "error"
          : status === "cancelled" && !isResuming
            ? "cancelled"
            : status === "completed"
              ? "completed"
              : isLive
                ? "running"
                : "idle";

      const chatRun: ChatRun = {
        id,
        daemonRunId: isLive ? runId : null,
        label: strategyName ?? "Loaded run",
        strategyPath: strategyPath ?? null,
        strategyName: strategyName ?? null,
        readOnly: !isLive,
        status: baseStatus,
        runStatus: isResuming ? "running" : status,
        error: isResuming ? null : (error?.message ?? null),
        pendingInputAgent: null,
        pendingPermissionRequests: [],
        pendingQuestionRequests: [],
        messages: projected,
        createdAt: now,
        updatedAt: now,
      };

      messageCountersRef.current.set(id, counter);

      setChatRuns((previousChatRuns) => {
        const next = new Map(previousChatRuns);
        next.set(id, chatRun);
        return next;
      });
      setActiveChatRunId(id);

      if (isResuming) {
        setResumingRunId(null);
        resumeRunCommand({ runId });
      } else if (isLive) {
        subscribeCommand({ runId });
      }

      return id;
    },
    [subscribeCommand, resumeRunCommand, resumingRunId],
  );

  const sendInput = useCallback(
    (chatRunId: ChatRunId, text: string): void => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(chatRunId);
        if (!chatRun) return previousChatRuns;
        if (!chatRun.daemonRunId || !chatRun.pendingInputAgent)
          return previousChatRuns;

        const counter = (messageCountersRef.current.get(chatRunId) ?? 0) + 1;
        messageCountersRef.current.set(chatRunId, counter);
        const userMessage: ChatMessage = {
          id: `${chatRunId}-msg-${counter}`,
          role: "user",
          sender: "you",
          text,
          streaming: false,
          timestamp: Date.now(),
        };

        sendUserInputCommand({
          runId: chatRun.daemonRunId,
          agentName: chatRun.pendingInputAgent,
          text,
        });

        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: [...chatRun.messages, userMessage],
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
      chatRunId: ChatRunId,
      decision: "allow" | "deny" | "allow-session" | "deny-session",
    ): void => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(chatRunId);
        if (
          !chatRun ||
          chatRun.pendingPermissionRequests.length === 0 ||
          !chatRun.daemonRunId
        )
          return previousChatRuns;

        const head = chatRun.pendingPermissionRequests[0]!;

        permissionDecisionCommand({
          runId: chatRun.daemonRunId,
          permissionRequestId: head.permissionRequestId,
          decision,
        });

        // Dequeue the head. For allow/deny (one-shot), policy_updated won't fire
        // so we clear here. For allow-session/deny-session, policy_updated also
        // dequeues — but dequeuing twice is harmless because the queue is already
        // shorter; in practice policy_updated fires after and finds the head already
        // gone, so it dequeues the next item. To keep it simple: always dequeue here
        // immediately for UX responsiveness.
        const remaining = chatRun.pendingPermissionRequests.slice(1);
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          status: remaining.length > 0 ? "waiting_permission" : "running",
          pendingPermissionRequests: remaining,
          updatedAt: Date.now(),
        });
        return next;
      });
    },
    [permissionDecisionCommand],
  );

  const sendQuestionResponse = useCallback(
    (chatRunId: ChatRunId, response: string): void => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(chatRunId);
        if (
          !chatRun ||
          chatRun.pendingQuestionRequests.length === 0 ||
          !chatRun.daemonRunId
        )
          return previousChatRuns;

        const head = chatRun.pendingQuestionRequests[0]!;

        questionResponseCommand({
          runId: chatRun.daemonRunId,
          questionRequestId: head.questionRequestId,
          response,
        });

        const remaining = chatRun.pendingQuestionRequests.slice(1);
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          status: remaining.length > 0 ? "waiting_question" : "running",
          pendingQuestionRequests: remaining,
          updatedAt: Date.now(),
        });
        return next;
      });
    },
    [questionResponseCommand],
  );

  const stopChatRun = useCallback(
    (chatRunId: ChatRunId): void => {
      const chatRun = chatRuns.get(chatRunId);
      if (!chatRun || !chatRun.daemonRunId) return;
      stopStrategyCommand({ runId: chatRun.daemonRunId });
    },
    [chatRuns, stopStrategyCommand],
  );

  const resetChatRun = useCallback(
    (chatRunId: ChatRunId): void => {
      updateChatRun(chatRunId, (chatRun) => ({
        ...chatRun,
        messages: [],
        status: "idle",
        error: null,
        pendingInputAgent: null,
        pendingPermissionRequests: [],
        pendingQuestionRequests: [],
        // Clear loaded-run metadata so the host app falls back to its
        // intro/strategy-selection view after a reset.
        strategyName: null,
        strategyPath: null,
        readOnly: false,
      }));
      messageCountersRef.current.set(chatRunId, 0);
    },
    [updateChatRun],
  );

  const removeChatRun = useCallback((chatRunId: ChatRunId): void => {
    setChatRuns((previousChatRuns) => {
      if (!previousChatRuns.has(chatRunId)) return previousChatRuns;
      const next = new Map(previousChatRuns);
      next.delete(chatRunId);
      return next;
    });
    messageCountersRef.current.delete(chatRunId);
    setActiveChatRunId((currentActive) =>
      currentActive === chatRunId ? null : currentActive,
    );
  }, []);

  const contextValue = useMemo<ChatRunsContextType>(
    () => ({
      chatRuns,
      activeChatRunId,
      setActiveChatRunId,
      createChatRun,
      startStrategy,
      sendInput,
      sendPermissionDecision,
      sendQuestionResponse,
      stopChatRun,
      resetChatRun,
      removeChatRun,
      persistedRuns,
      fetchPersistedRuns,
      loadPersistedRun,
      resumeRun,
      isLoadingRun,
    }),
    [
      chatRuns,
      activeChatRunId,
      createChatRun,
      startStrategy,
      sendInput,
      sendPermissionDecision,
      sendQuestionResponse,
      stopChatRun,
      resetChatRun,
      removeChatRun,
      persistedRuns,
      fetchPersistedRuns,
      loadPersistedRun,
      resumeRun,
      isLoadingRun,
    ],
  );

  return (
    <ChatRunsContext.Provider value={contextValue}>
      {children}
    </ChatRunsContext.Provider>
  );
}
