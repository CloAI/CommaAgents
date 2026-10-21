import { persistRunSnapshot } from "../history/persistence";
import type {
  AgentCallIdentity,
  AgentStreamEvent,
  AgentCallResult,
} from "@comma-agents/core";
import type { RunEntry, RunsContext } from "../state/state.types";
import type { RunContent, RunMessage } from "./messages.types";
import { messageJson, responseContent } from "./messages.utils";

/**
 * Allocate active display state using the invocation's existing conversation identity.
 * @param {RunsContext} context - Private run and message state.
 * @param {RunEntry} entry - Owning execution.
 * @param {string} agentName - Invoking agent.
 * @param {AgentCallIdentity} identity - Identity allocated by the agent before streaming.
 * @returns {Promise<void>} Initial durable message position.
 * @internal
 */
export async function startAgentMessage(
  context: RunsContext,
  entry: RunEntry,
  agentName: string,
  identity: AgentCallIdentity,
): Promise<void> {
  if (context.activeMessages.has(identity.messageId)) {
    return;
  }
  const message: RunMessage = {
    type: "message",
    ...identity,
    runId: entry.snapshot.runId,
    parentRunId: entry.snapshot.parentRunId,
    role: "agent",
    agentName,
    status: "streaming",
    content: [],
  };
  context.activeMessages.set(identity.messageId, {
    message,
    reasoning: new Map(),
    tools: new Map(),
  });
  context.revision++;
  await persistRunSnapshot(context, message);
}

/**
 * Accumulate an agent event and emit a complete replacement for the changed content block.
 * @param {RunsContext} context - Feature message state and notifications.
 * @param {RunEntry} entry - Owning execution.
 * @param {string} agentName - Originating agent.
 * @param {AgentStreamEvent} event - Invocation-tagged stream event.
 * @returns {Promise<void>} Update processing completion.
 * @internal
 */
export async function streamAgentMessage(
  context: RunsContext,
  entry: RunEntry,
  agentName: string,
  event: AgentStreamEvent,
): Promise<void> {
  if (
    !event.messageId ||
    event.type === "done" ||
    event.type === "retention" ||
    event.type === "step-start"
  ) {
    return;
  }
  await startAgentMessage(context, entry, agentName, {
    messageId: event.messageId,
    createdAt: event.createdAt ?? new Date().toISOString(),
  });
  const active = context.activeMessages.get(event.messageId)!;
  const content = [...active.message.content];
  let contentIndex: number;
  let block: RunContent;
  if (event.type === "text") {
    const previous = content.at(-1);
    contentIndex =
      previous?.type === "text" ? content.length - 1 : content.length;
    block = {
      type: "text",
      text: (previous?.type === "text" ? previous.text : "") + event.text,
    };
  } else if (
    event.type === "thinking-start" ||
    event.type === "thinking" ||
    event.type === "thinking-end"
  ) {
    contentIndex = active.reasoning.get(event.id) ?? content.length;
    active.reasoning.set(event.id, contentIndex);
    const previous = content[contentIndex];
    block = {
      type: "reasoning",
      text:
        (previous?.type === "reasoning" ? previous.text : "") +
        (event.type === "thinking" ? event.text : ""),
    };
  } else {
    contentIndex = active.tools.get(event.toolCallId) ?? content.length;
    active.tools.set(event.toolCallId, contentIndex);
    const previous = content[contentIndex];
    if (event.type === "tool-call") {
      let toolArguments: unknown;
      try {
        toolArguments = JSON.parse(event.args);
      } catch {
        toolArguments = event.args;
      }
      block = {
        type: "tool",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        arguments: messageJson(toolArguments),
        status: "running",
        mcp: event.mcp,
      };
    } else {
      block = {
        type: "tool",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        arguments: previous?.type === "tool" ? previous.arguments : null,
        status: event.status,
        output: event.output,
        error: event.error,
        mcp: event.mcp,
      };
    }
  }
  content[contentIndex] = block;
  active.message = { ...active.message, content };
  context.revision++;
  context.notifications.notify(entry.snapshot.runId, {
    type: "run_message_stream",
    runId: entry.snapshot.runId,
    messageId: active.message.messageId,
    agentName,
    createdAt: active.message.createdAt,
    contentIndex,
    content: block,
  });
}

/**
 * Finalize a displayed agent invocation after its conversation record is durable.
 * @param {RunsContext} context - Feature message state.
 * @param {RunEntry} entry - Owning execution.
 * @param {string} agentName - Originating agent.
 * @param {AgentCallResult} result - Identified completed result.
 * @returns {Promise<void>} Durable message completion and notification.
 * @internal
 */
export async function completeAgentMessage(
  context: RunsContext,
  entry: RunEntry,
  agentName: string,
  result: AgentCallResult,
): Promise<void> {
  if (!result.messageId) {
    throw new Error(
      `Agent ${agentName} did not provide a conversation message identity`,
    );
  }
  await startAgentMessage(context, entry, agentName, {
    messageId: result.messageId,
    createdAt: result.createdAt ?? new Date().toISOString(),
  });
  const active = context.activeMessages.get(result.messageId)!;
  const completedContent = responseContent(result);
  const message: RunMessage = {
    ...active.message,
    status: "completed",
    content: completedContent.length
      ? completedContent
      : active.message.content,
  };
  await persistRunSnapshot(context, message);
  context.activeMessages.delete(message.messageId);
  context.revision++;
  context.notifications.notify(message.runId, {
    type: "run_message_output",
    runId: message.runId,
    message,
  });
}

/**
 * Persist partial messages without admitting them as successful model-context records.
 * @param {RunsContext} context - Feature-owned message state.
 * @param {string} runId - Stopped or failed execution.
 * @param {"cancelled" | "failed"} status - Display outcome for unfinished invocations.
 * @param {string} messageId - Restrict an individual failed invocation, when supplied.
 * @returns {Promise<void>} Partial messages finalized durably.
 * @internal
 */
export async function interruptAgentMessages(
  context: RunsContext,
  runId: string,
  status: "cancelled" | "failed",
  messageId?: string,
): Promise<void> {
  for (const [activeMessageId, active] of context.activeMessages) {
    if (
      active.message.runId !== runId ||
      (messageId !== undefined && activeMessageId !== messageId)
    ) {
      continue;
    }
    const message: RunMessage = {
      ...active.message,
      status,
      content: active.message.content.map((block) =>
        block.type === "tool" && block.status === "running"
          ? { ...block, status: status === "cancelled" ? "cancelled" : "error" }
          : block,
      ),
    };
    await persistRunSnapshot(context, message);
    context.activeMessages.delete(activeMessageId);
    context.revision++;
    context.notifications.notify(runId, {
      type: "run_message_output",
      runId,
      message,
    });
  }
}

/**
 * Persist and publish one human prompt or answer in the conversation progression.
 * @param {RunsContext} context - Feature-owned storage and notifications.
 * @param {string} runId - Owning execution.
 * @param {string} text - User-provided text.
 * @returns {Promise<void>} Durable display-message completion.
 * @internal
 */
export async function saveUserMessage(
  context: RunsContext,
  runId: string,
  text: string,
): Promise<void> {
  const message: RunMessage = {
    type: "message",
    messageId: crypto.randomUUID(),
    runId,
    parentRunId: context.identities.get(runId)?.parentRunId,
    role: "user",
    createdAt: new Date().toISOString(),
    status: "completed",
    content: [{ type: "text", text }],
  };
  await persistRunSnapshot(context, message);
  context.notifications.notify(runId, {
    type: "run_message_output",
    runId,
    message,
  });
}
