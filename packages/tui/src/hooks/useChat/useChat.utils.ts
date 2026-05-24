import type {
  AssistantModelMessage,
  ResponseMessage,
  ToolModelMessage,
  UserModelMessage,
} from "@comma-agents/core";
import type { RunTurn } from "@comma-agents/daemon";

import type { ChatMessage, MessageSegment } from "./useChat.types";

/**
 * Flatten the `content` field of a `UserModelMessage` into a plain string.
 *
 * AI SDK user content is either a literal string or an array of typed parts
 * (text/image/file). For TUI rendering we concatenate text parts and drop
 * non-text parts (they are not displayed for the user role).
 */
export function userMessageToText(userMessage: UserModelMessage): string {
  const { content } = userMessage;
  if (typeof content === "string") return content;
  let text = "";
  for (const part of content) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/**
 * Convert an `AssistantModelMessage` into ordered `MessageSegment`s.
 *
 * Tool-call parts become `tool-call` segments (no result yet — that arrives
 * in a subsequent `ToolModelMessage`). Reasoning parts become `thinking`
 * segments. Text parts become `text` segments. Image/file parts are
 * currently dropped because the TUI cannot render them inline.
 */
function assistantMessageToSegments(
  assistantMessage: AssistantModelMessage,
): MessageSegment[] {
  const { content } = assistantMessage;
  if (typeof content === "string") {
    return content.length > 0
      ? [{ type: "text", text: content, streaming: false }]
      : [];
  }
  const segments: MessageSegment[] = [];
  for (const part of content) {
    if (part.type === "text") {
      segments.push({ type: "text", text: part.text, streaming: false });
    } else if (part.type === "reasoning") {
      segments.push({
        type: "thinking",
        id: `reasoning-${segments.length}`,
        text: part.text,
        streaming: false,
      });
    } else if (part.type === "tool-call") {
      segments.push({
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args:
          typeof part.input === "string"
            ? part.input
            : JSON.stringify(part.input),
      });
    }
  }
  return segments;
}

/**
 * Convert a `ToolModelMessage` into `tool-result` segments matched to the
 * preceding `tool-call` segments by `toolCallId`.
 */
function toolMessageToSegments(
  toolMessage: ToolModelMessage,
): MessageSegment[] {
  const segments: MessageSegment[] = [];
  for (const part of toolMessage.content) {
    if (part.type !== "tool-result") continue;
    const output = part.output;
    const outputText =
      typeof output === "string"
        ? output
        : output && typeof output === "object" && "value" in output
          ? typeof output.value === "string"
            ? output.value
            : JSON.stringify(output.value)
          : JSON.stringify(output);
    segments.push({
      type: "tool-result",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      output: outputText,
      status: "completed",
    });
  }
  return segments;
}

/** Concatenate every `text` segment so legacy consumers still see a flat body. */
function segmentsToFlatText(segments: readonly MessageSegment[]): string {
  let text = "";
  for (const segment of segments) {
    if (segment.type === "text") text += segment.text;
  }
  return text;
}

/**
 * Project a persisted `RunTurn` into ordered `ChatMessage`s.
 *
 * Emits at most one user message (when the turn was initiated by a human)
 * followed by one combined agent message holding all assistant/tool segments
 * from the response chain. `nextId` mints the message id; `timestamp` is the
 * fallback timestamp when nothing better is available on the turn.
 */
export function projectRunTurnToMessages(
  turn: RunTurn,
  nextId: () => string,
  timestamp: number,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  const userText = userMessageToText(turn.userMessage);
  if (userText.length > 0 && turn.userMessageSource !== "agent") {
    messages.push({
      id: nextId(),
      role: "user",
      sender: "you",
      text: userText,
      streaming: false,
      timestamp,
    });
  }

  const responseSegments: MessageSegment[] = [];
  for (const response of turn.responseMessages as readonly ResponseMessage[]) {
    if (response.role === "assistant") {
      responseSegments.push(...assistantMessageToSegments(response));
    } else if (response.role === "tool") {
      responseSegments.push(...toolMessageToSegments(response));
    }
  }

  const responseText = segmentsToFlatText(responseSegments);
  if (userText === responseText) {
    // If the input prompt is identical to the output response, it is a human-in-the-loop
    // user step replaying. Only show the "you" message.
    return messages;
  }

  if (responseSegments.length > 0) {
    messages.push({
      id: nextId(),
      role: "agent",
      sender: turn.agentName,
      text: responseText,
      segments: responseSegments,
      streaming: false,
      timestamp,
    });
  }

  return messages;
}
