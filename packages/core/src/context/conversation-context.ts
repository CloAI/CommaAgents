import type { ModelMessage, UserModelMessage } from "ai";
import { projectConversationContext } from "../timeline/projections/conversation-context";
import { createTimeline } from "../timeline/timeline";
import type { Timeline } from "../timeline/timeline.types";

import type {
  ConversationContextConfig,
  ConversationTurn,
  ResponseMessage,
} from "./conversation-context.types";

/** Wrap a plain string as a UserModelMessage. */
function toUserMessage(text: string | UserModelMessage): UserModelMessage {
  if (typeof text === "string") {
    return { role: "user", content: text };
  }
  return text;
}

/**
 * The ConversationContext interface wrapper.
 * Adapts a `Timeline` so existing LLM agents and loader code continue to run untouched,
 * while shifting state storage to the unified event timeline.
 */
export function createConversationContext(
  config?: ConversationContextConfig,
): ConversationContext {
  const timeline: Timeline = createTimeline();

  // We apply the sliding window / token budget truncation rules over the entire,
  // merged list of turns.
  const getMergedTurns = (): readonly ConversationTurn[] => {
    // 1. Gather all agent_call events
    const turns: ConversationTurn[] = [];
    for (const ev of timeline.events()) {
      if (ev.type === "agent_call") {
        turns.push({
          agentName: ev.agentName,
          userMessage: ev.userMessage,
          responseMessages: ev.responseMessages as ResponseMessage[],
        });
      }
    }

    // 2. Wrap them as virtual timeline events for the active agent to run projectConversationContext
    // This allows us to reuse the exact same token-estimation and sliding-window logic.
    const virtualEvents = turns.map((turn) => ({
      type: "agent_call" as const,
      ts: new Date().toISOString(),
      agentName: "merged",
      userMessage: turn.userMessage,
      responseMessages: turn.responseMessages,
    }));

    const projected = projectConversationContext(
      virtualEvents,
      "merged",
      config,
    );

    // 3. Map virtual merged turns back to their original agent names
    return projected.turns.map((mergedTurn, index) => {
      const originalTurn =
        turns[turns.length - projected.turns.length + index]!;
      return {
        agentName: originalTurn.agentName,
        userMessage: mergedTurn.userMessage,
        responseMessages: mergedTurn.responseMessages,
      };
    });
  };

  return {
    get length() {
      return getMergedTurns().length;
    },

    get isEmpty() {
      return getMergedTurns().length === 0;
    },

    append(
      userMessage: string | UserModelMessage,
      responseMessages: readonly ResponseMessage[],
      agentName: string,
    ): void {
      timeline.append({
        type: "agent_call",
        ts: new Date().toISOString(),
        agentName,
        userMessage: toUserMessage(userMessage),
        responseMessages,
      });
    },

    allMessages(): readonly ModelMessage[] {
      const turns = getMergedTurns();
      const messages: ModelMessage[] = [];
      for (const turn of turns) {
        messages.push(turn.userMessage);
        for (const msg of turn.responseMessages) {
          messages.push(msg);
        }
      }
      return messages;
    },

    allTurns(): readonly ConversationTurn[] {
      return getMergedTurns();
    },

    lastTurn(): ConversationTurn | undefined {
      const turns = this.allTurns();
      return turns.length > 0 ? turns[turns.length - 1] : undefined;
    },

    estimateTokens(): number {
      const turns = this.allTurns();
      let totalChars = 0;
      for (const turn of turns) {
        const userContent = turn.userMessage.content;
        totalChars += typeof userContent === "string" ? userContent.length : 0;
        for (const msg of turn.responseMessages) {
          const content = msg.content;
          if (typeof content === "string") {
            totalChars += content.length;
          } else if (Array.isArray(content)) {
            for (const part of content) {
              if ("text" in part && typeof part.text === "string") {
                totalChars += part.text.length;
              }
            }
          }
        }
      }
      return Math.ceil(totalChars * (config?.tokensPerChar ?? 0.25));
    },

    snapshot(): readonly ConversationTurn[] {
      return Object.freeze(this.allTurns());
    },

    restore(turns: readonly ConversationTurn[]): void {
      timeline.clear();
      for (const turn of turns) {
        timeline.append({
          type: "agent_call",
          ts: new Date().toISOString(),
          agentName: turn.agentName,
          userMessage: turn.userMessage,
          responseMessages: turn.responseMessages,
        });
      }
    },

    clear(): void {
      timeline.clear();
    },

    [Symbol.iterator](): Iterator<ConversationTurn> {
      let index = 0;
      const turns = this.allTurns();
      return {
        next(): IteratorResult<ConversationTurn> {
          if (index < turns.length) {
            return {
              value: turns[index++]!,
              done: false,
            } as IteratorYieldResult<ConversationTurn>;
          }
          return {
            value: undefined,
            done: true,
          } as IteratorReturnResult<undefined>;
        },
      };
    },
  };
}

// ConversationContext interface re-export
export interface ConversationContext {
  readonly length: number;
  readonly isEmpty: boolean;
  append(
    userMessage: string | UserModelMessage,
    responseMessages: readonly ResponseMessage[],
    agentName: string,
  ): void;
  allMessages(): readonly ModelMessage[];
  allTurns(): readonly ConversationTurn[];
  lastTurn(): ConversationTurn | undefined;
  estimateTokens(): number;
  snapshot(): readonly ConversationTurn[];
  restore(turns: readonly ConversationTurn[]): void;
  clear(): void;
  [Symbol.iterator](): Iterator<ConversationTurn>;
}
