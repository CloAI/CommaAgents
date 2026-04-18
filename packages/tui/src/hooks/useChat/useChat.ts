import { useCallback, useState } from "react";

import { useDaemonContext } from "../useDaemon/useDaemon";
import { useDaemonCommand } from "../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage, ChatStatus, UseChatConfig } from "./useChat.types";

let nextMessageId = 0;
function createMessageId(): string {
  nextMessageId += 1;
  return `msg-${nextMessageId}`;
}

/** State returned by the useChat hook. */
export interface UseChatState {
  readonly messages: readonly ChatMessage[];
  readonly status: ChatStatus;
  readonly error: string | null;
  /** Which agent is currently waiting for user input (null if none). */
  readonly pendingInputAgent: string | null;
  /** Current run ID (set after strategy_started). */
  readonly runId: string | null;
  /** Current daemon connection status. */
  readonly connectionStatus: string;
  /** Start a strategy on the daemon. */
  readonly startStrategy: (strategyPath: string, input?: string) => void;
  /** Send user input in response to a request_input prompt. */
  readonly sendInput: (text: string) => void;
  /** Reset the chat to idle state. */
  readonly reset: () => void;
}

/**
 * React hook for managing daemon-backed chat.
 *
 * Handles the full lifecycle: start_strategy -> stream tokens
 * -> handle request_input -> strategy_completed/error.
 *
 * Requires a `<DaemonProvider>` ancestor in the component tree.
 * The daemon URL is configured on the provider, not on this hook.
 */
export function useChat(_config?: UseChatConfig): UseChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingInputAgent, setPendingInputAgent] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const { status: connectionStatus } = useDaemonContext();

  const startStrategyCommand = useDaemonCommand("start_strategy");
  const sendUserInputCommand = useDaemonCommand("user_input");

  const appendOrUpdateMessage = useCallback(
    (agentName: string, token: string, streaming: boolean) => {
      setMessages((prev) => {
        const lastIndex = prev.findLastIndex(
          (message) => message.sender === agentName && message.streaming,
        );
        if (lastIndex >= 0) {
          const updated = [...prev];
          const existing = updated[lastIndex]!;
          updated[lastIndex] = {
            ...existing,
            text: existing.text + token,
            streaming,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: createMessageId(),
            role: "agent" as const,
            sender: agentName,
            text: token,
            streaming,
            timestamp: Date.now(),
          },
        ];
      });
    },
    [],
  );

  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createMessageId(),
        role: "system" as const,
        sender: "system",
        text,
        streaming: false,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  useDaemonSubscription(
    "strategy_started",
    (message) => {
      setRunId(message.runId);
      setStatus("running");
      addSystemMessage(
        `Strategy "${message.strategyName}" started (agents: ${message.agents.join(", ")})`,
      );
    },
    runId,
  );

  useDaemonSubscription(
    "step_started",
    (message) => {
      addSystemMessage(`[${message.stepName}] started`);
    },
    runId,
  );

  useDaemonSubscription(
    "agent_streaming",
    (message) => {
      if (message.event.type === "text") {
        appendOrUpdateMessage(message.agentName, message.event.text, true);
      } else if (message.event.type === "done") {
        setMessages((prev) => {
          const lastIndex = prev.findLastIndex(
            (entry) => entry.sender === message.agentName && entry.streaming,
          );
          if (lastIndex >= 0) {
            const updated = [...prev];
            const existing = updated[lastIndex]!;
            updated[lastIndex] = { ...existing, streaming: false };
            return updated;
          }
          return prev;
        });
      }
    },
    runId,
  );

  useDaemonSubscription(
    "agent_output",
    (message) => {
      appendOrUpdateMessage(message.agentName, message.text, false);
    },
    runId,
  );

  useDaemonSubscription(
    "step_completed",
    (message) => {
      addSystemMessage(`[${message.stepName}] completed`);
    },
    runId,
  );

  useDaemonSubscription(
    "request_input",
    (message) => {
      setPendingInputAgent(message.agentName);
      setStatus("waiting_input");
      if (message.prompt) {
        addSystemMessage(message.prompt);
      }
    },
    runId,
  );

  useDaemonSubscription(
    "strategy_completed",
    (_message) => {
      setStatus("done");
      addSystemMessage("Strategy completed.");
    },
    runId,
  );

  useDaemonSubscription(
    "strategy_error",
    (message) => {
      setStatus("error");
      setError(message.error.message);
      addSystemMessage(`Error: ${message.error.message}`);
    },
    runId,
  );

  useDaemonSubscription("error", (message) => {
    setStatus("error");
    setError(message.message);
    addSystemMessage(`Error: ${message.message}`);
  });

  const startStrategy = useCallback(
    (strategyPath: string, input?: string) => {
      setStatus("running");
      setError(null);
      setMessages([]);
      setRunId(null);
      setPendingInputAgent(null);

      const requestId = startStrategyCommand({
        strategyPath,
        ...(input !== undefined ? { input } : {}),
      });

      if (!requestId) {
        setStatus("error");
        setError("Cannot reach daemon — is it running? Start it with: bun run daemon");
      }
    },
    [startStrategyCommand],
  );

  const sendInput = useCallback(
    (text: string) => {
      if (!runId || !pendingInputAgent) return;

      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: "user" as const,
          sender: "you",
          text,
          streaming: false,
          timestamp: Date.now(),
        },
      ]);

      sendUserInputCommand({ runId, agentName: pendingInputAgent, text });
      setPendingInputAgent(null);
      setStatus("running");
    },
    [runId, pendingInputAgent, sendUserInputCommand],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setStatus("idle");
    setError(null);
    setRunId(null);
    setPendingInputAgent(null);
  }, []);

  return {
    messages,
    status,
    error,
    pendingInputAgent,
    runId,
    connectionStatus,
    startStrategy,
    sendInput,
    reset,
  };
}
