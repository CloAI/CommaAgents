import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type { ChatMessage, MessageSegment } from "../useChat.types";
import {
  createLocalChatMessageId,
  getActiveLaunchStrategyId,
} from "../useChat.utils";
import { useChatRunStore } from "../useChatRunStore";

/** Project streamed and completed agent output into local chat messages. */
export function useChatAgentMessages(): void {
  const { setChatRuns } = useChatRunStore();

  useDaemonSubscription("agent_streaming", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const chatRunId = chatRun.id;

      // Locate (or create) the in-flight agent message for this agent. We
      // group all streaming events (text, tool-call, tool-result, ...) for
      // an agent's turn into a single message with ordered segments, so
      // the UI can render tool calls inline with the prose.
      const lastAgentIndex = chatRun.messages.findLastIndex(
        (existing) =>
          existing.sender === message.agentName && existing.streaming,
      );

      const ensureAgentMessage = (
        currentMessages: readonly ChatMessage[],
      ): { messages: ChatMessage[]; index: number } => {
        const mutable = [...currentMessages];
        if (lastAgentIndex >= 0) {
          return { messages: mutable, index: lastAgentIndex };
        }
        const parentToolCallId = getActiveLaunchStrategyId(chatRun);
        const fresh: ChatMessage = {
          id: createLocalChatMessageId(chatRun.id),
          role: "agent",
          sender: message.agentName,
          text: "",
          segments: [],
          streaming: true,
          ...(message.model !== undefined ? { model: message.model } : {}),
          ...(message.contextWindow !== undefined
            ? { contextWindow: message.contextWindow }
            : {}),
          ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
          timestamp: Date.now(),
        };
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

      if (message.event.type === "retention") {
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
        nextMessages[index] = appendSegment(nextMessages[index]!, {
          type: "retention",
          event: message.event.event,
        });
        const next = new Map(previousChatRuns);
        next.set(chatRun.id, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

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
        next.set(chatRun.id, {
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
        next.set(chatRun.id, {
          ...chatRun,
          messages: nextMessages,
          activeLaunchStrategyIds:
            message.event.toolName === "launch_strategy"
              ? [...chatRun.activeLaunchStrategyIds, message.event.toolCallId]
              : chatRun.activeLaunchStrategyIds,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "tool-result") {
        const event = message.event;
        const { messages: nextMessages, index } = ensureAgentMessage(
          chatRun.messages,
        );
        nextMessages[index] = appendSegment(nextMessages[index]!, {
          type: "tool-result",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          output: event.output,
          status: event.status,
          ...(event.error !== undefined ? { error: event.error } : {}),
        });
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          activeLaunchStrategyIds:
            event.toolName === "launch_strategy"
              ? chatRun.activeLaunchStrategyIds.filter(
                  (toolCallId) => toolCallId !== event.toolCallId,
                )
              : chatRun.activeLaunchStrategyIds,
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
          usage: message.event.result.usage,
          ...(message.event.result.contextUsage !== undefined
            ? { contextUsage: message.event.result.contextUsage }
            : {}),
          completedAt: Date.now(),
        };
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: mutableMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      if (message.event.type === "step-start") {
        const { messages: nextMessages } = ensureAgentMessage(chatRun.messages);
        const next = new Map(previousChatRuns);
        next.set(chatRunId, {
          ...chatRun,
          messages: nextMessages,
          updatedAt: Date.now(),
        });
        return next;
      }

      return previousChatRuns;
    });
  });

  useDaemonSubscription("agent_output", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const chatRunId = chatRun.id;

      // If the streaming subscription has already produced a message for this
      // agent (in-flight or finalized) carrying text, `agent_output` is a
      // duplicate of that streamed message and must be skipped. Note: the
      // daemon emits `agent_output` BEFORE the streaming `done` event, so the
      // streamed message is typically still `streaming: true` at this point —
      // we must NOT gate on `!streaming` here.
      const lastAgentMessage = chatRun.messages.at(-1);
      const hasProjectedOutput =
        lastAgentMessage?.role === "agent" &&
        lastAgentMessage.text.length !== undefined &&
        (lastAgentMessage.text.length > 0 ||
          (lastAgentMessage.segments ?? []).some(
            (segment) =>
              segment.type === "text" || segment.type === "retention",
          ));
      if (
        lastAgentMessage &&
        lastAgentMessage.sender === message.agentName &&
        hasProjectedOutput
      ) {
        return previousChatRuns;
      }

      const parentToolCallId = getActiveLaunchStrategyId(chatRun);
      const agentMessage: ChatMessage = {
        id: createLocalChatMessageId(chatRunId),
        role: "agent",
        sender: message.agentName,
        text: message.text,
        segments: [{ type: "text", text: message.text, streaming: false }],
        streaming: false,
        ...(message.model !== undefined ? { model: message.model } : {}),
        ...(message.contextWindow !== undefined
          ? { contextWindow: message.contextWindow }
          : {}),
        ...(message.usage !== undefined ? { usage: message.usage } : {}),
        ...(message.contextUsage !== undefined
          ? { contextUsage: message.contextUsage }
          : {}),
        completedAt: Date.now(),
        ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
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
}
