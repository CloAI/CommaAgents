import { RunErrorCode } from "../errors";
import { RunToolStatus } from "./messages.schemas";
import type { ConversationRecord, AgentCallResult } from "@comma-agents/core";
import type { z } from "zod/v4";
import type { RunContent } from "./messages.types";

/**
 * Preserve JSON values at the display boundary without retaining SDK objects.
 * @param {unknown} value - Tool arguments or output.
 * @returns {z.infer<z.ZodJSONSchema>} Serializable value.
 * @internal
 */
export function messageJson(value: unknown): z.infer<z.ZodJSONSchema> {
  return JSON.parse(JSON.stringify(value ?? null)) as z.infer<z.ZodJSONSchema>;
}

/**
 * Project ordered response parts into display blocks for persisted and custom-execute results.
 * @param {Pick<ConversationRecord, "responseMessages" | "text"> | AgentCallResult} record - Completed invocation.
 * @returns {RunContent[]} Ordered visual content.
 * @internal
 */
export function responseContent(
  record:
    | Pick<ConversationRecord, "responseMessages" | "text">
    | AgentCallResult,
): RunContent[] {
  const content: RunContent[] = [];
  const tools = new Map<string, number>();
  for (const response of record.responseMessages) {
    if (typeof response.content === "string") {
      if (response.content.length !== 0) {
        content.push({ type: "text", text: response.content });
      }
      continue;
    }
    for (const part of response.content) {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text });
      } else if (part.type === "reasoning") {
        content.push({ type: "reasoning", text: part.text });
      } else if (part.type === "tool-call") {
        tools.set(part.toolCallId, content.length);
        content.push({
          type: "tool",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          arguments: messageJson(part.input),
          status: RunToolStatus.running,
        });
      } else if (part.type === "tool-result") {
        const index = tools.get(part.toolCallId);
        const tool = index === undefined ? undefined : content[index];
        if (tool?.type === "tool" && index !== undefined) {
          const output = part.output;
          const failed =
            output.type === "error-text" || output.type === "error-json";
          const base = {
            type: "tool" as const,
            toolCallId: tool.toolCallId,
            toolName: tool.toolName,
            arguments: tool.arguments,
            mcp: tool.mcp,
            output: messageJson("value" in output ? output.value : output),
          };
          content[index] = failed
            ? {
                ...base,
                status: RunToolStatus.failed,
                error: { code: RunErrorCode.TOOL_EXECUTION_ERROR },
              }
            : { ...base, status: RunToolStatus.completed };
        }
      }
    }
  }
  if (content.length === 0 && record.text.length !== 0) {
    content.push({ type: "text", text: record.text });
  }
  return content;
}
