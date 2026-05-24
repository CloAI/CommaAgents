import type { ModelMessage } from "ai";
import type {
  ConversationTurn,
  ResponseMessage,
} from "../../context/conversation-context.types";
import type { TimelineEvent } from "../timeline.types";

export interface ProjectedConversationContext {
  readonly turns: readonly ConversationTurn[];
  readonly allMessages: readonly ModelMessage[];
  readonly length: number;
}

interface ProjectionConfig {
  readonly maxTurns?: number;
  readonly maxTokens?: number;
  readonly tokensPerChar?: number;
}

const DEFAULT_TOKENS_PER_CHAR = 0.25;

/** Pure function to estimate token count for a set of turns. */
function estimateTokens(
  turns: readonly ConversationTurn[],
  tokensPerChar: number,
): number {
  let totalChars = 0;
  for (const turn of turns) {
    const userContent = turn.userMessage.content;
    totalChars += typeof userContent === "string" ? userContent.length : 0; // estimate minimal for non-string
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
  return Math.ceil(totalChars * tokensPerChar);
}

/** Flatten turns into flat ModelMessage[] format for the LLM. */
function turnsToMessages(
  turns: readonly ConversationTurn[],
): readonly ModelMessage[] {
  const messages: ModelMessage[] = [];
  for (const turn of turns) {
    messages.push(turn.userMessage);
    for (const msg of turn.responseMessages) {
      messages.push(msg);
    }
  }
  return messages;
}

/**
 * Pure projection: Replays timeline events to build an agent's windowed conversation turns.
 * Applies the sliding-window maxTurns and maxTokens truncation strategy inline.
 */
export function projectConversationContext(
  events: readonly TimelineEvent[],
  agentName: string,
  config: ProjectionConfig = {},
): ProjectedConversationContext {
  const maxTurns = config.maxTurns ?? Number.POSITIVE_INFINITY;
  const maxTokens = config.maxTokens;
  const tokensPerChar = config.tokensPerChar ?? DEFAULT_TOKENS_PER_CHAR;

  // 1. Gather all raw agent_call events for this agent
  let turns: ConversationTurn[] = [];
  for (const event of events) {
    if (event.type === "agent_call" && event.agentName === agentName) {
      turns.push({
        agentName: event.agentName,
        userMessage: event.userMessage,
        responseMessages: event.responseMessages as ResponseMessage[],
      });
    }
  }

  // 2. Enforce sliding window (maxTurns)
  while (turns.length > maxTurns) {
    turns = turns.slice(1);
  }

  // 3. Enforce token budget (maxTokens)
  if (maxTokens !== undefined) {
    while (
      turns.length > 0 &&
      estimateTokens(turns, tokensPerChar) > maxTokens
    ) {
      turns = turns.slice(1);
    }
  }

  return {
    turns,
    allMessages: turnsToMessages(turns),
    length: turns.length,
  };
}
