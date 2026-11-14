import { RunErrorCode } from "../errors";
import { persistRunWrite } from "../history/persistence";
import { RunPhase } from "../state/state.schemas";
import { RunMessageStatus, RunToolStatus } from "./messages.schemas";
import { getQualifiedModelMetadata } from "@comma-agents/core";
import type {
  AgentCallIdentity,
  AgentStreamEvent,
  AgentCallResult,
  ConversationRecord,
} from "@comma-agents/core";
import type { RunEntry, RunsContext } from "../state/state.types";
import type {
  RunContent,
  RunMessage,
  StreamingAgentMessage,
} from "./messages.types";
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
  if (entry.activeMessages.has(identity.messageId)) {
    return;
  }
  const model =
    entry.state.phase === RunPhase.running ||
    entry.state.phase === RunPhase.prepared
      ? entry.state.strategy.agents[agentName]?.config?.model
      : undefined;
  const contextWindow =
    model === undefined
      ? undefined
      : getQualifiedModelMetadata(model)?.metadata.contextWindow;
  const message: StreamingAgentMessage = {
    type: "message",
    ...identity,
    runId: entry.runId,
    parentRunId: entry.parentRunId,
    role: "agent",
    agentName,
    ...(model !== undefined ? { model } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    status: RunMessageStatus.streaming,
    content: [],
  };
  entry.activeMessages.set(identity.messageId, {
    message,
    reasoning: new Map(),
    tools: new Map(),
  });
  await persistRunWrite(
    entry,
    context.history.reserve(entry.runId, message.messageId),
  );
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
    event.messageId === undefined ||
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
  const active = entry.activeMessages.get(event.messageId)!;
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
        status: RunToolStatus.running,
        mcp: event.mcp,
      };
    } else {
      const base = {
        type: "tool" as const,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        arguments: previous?.type === "tool" ? previous.arguments : null,
        output: event.output,
        mcp: event.mcp,
        ...("cancellationRequestedBy" in event &&
        event.cancellationRequestedBy === "user_steering"
          ? { cancellationRequestedBy: "user_steering" as const }
          : {}),
        ...(previous?.type === "tool" &&
        previous.cancellationRequestedBy !== undefined
          ? { cancellationRequestedBy: previous.cancellationRequestedBy }
          : {}),
      };
      block =
        event.status === "completed"
          ? { ...base, status: RunToolStatus.completed }
          : "cancellationReason" in event &&
              event.cancellationReason === "user_steering"
            ? {
                ...base,
                status: RunToolStatus.stopped,
                cancellationReason: "user_steering",
              }
            : {
                ...base,
                status: RunToolStatus.failed,
                output: event.error ?? event.output,
                error: { code: RunErrorCode.TOOL_EXECUTION_ERROR },
              };
    }
  }
  content[contentIndex] = block;
  active.message = { ...active.message, content };
  context.notifications.notify(entry.runId, {
    type: "run_message_stream",
    runId: entry.runId,
    messageId: active.message.messageId,
    agentName,
    createdAt: active.message.createdAt,
    ...(active.message.model !== undefined
      ? { model: active.message.model }
      : {}),
    ...(active.message.contextWindow !== undefined
      ? { contextWindow: active.message.contextWindow }
      : {}),
    contentIndex,
    content: block,
  });
}

/**
 * Finalize a displayed agent invocation after its conversation record is durable.
 * @internal
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} entry - Run that owns the operation.
 * @param {string} agentName - Agent that owns this invocation.
 * @param {AgentCallResult} result - Completed agent invocation.
 * @param {ConversationRecord} record - Canonical conversation record when supported.
 * @returns {Promise<void>} Operation result.
 */
export async function completeAgentMessage(
  context: RunsContext,
  entry: RunEntry,
  agentName: string,
  result: AgentCallResult,
  record?: ConversationRecord,
): Promise<void> {
  if (result.messageId === undefined) {
    throw new Error(
      `Agent ${agentName} did not provide a conversation message identity`,
    );
  }
  await startAgentMessage(context, entry, agentName, {
    messageId: result.messageId,
    createdAt: result.createdAt ?? new Date().toISOString(),
  });
  const active = entry.activeMessages.get(result.messageId)!;
  const completedContent = responseContent(record ?? result).map(
    (block): RunContent => {
      if (block.type !== "tool" || block.mcp !== undefined) {
        return block;
      }
      const index = active.tools.get(block.toolCallId);
      const streamed =
        index === undefined ? undefined : active.message.content[index];
      return streamed?.type === "tool" && streamed.mcp !== undefined
        ? { ...block, mcp: streamed.mcp }
        : block;
    },
  );
  const message: RunMessage = {
    ...active.message,
    status: RunMessageStatus.completed,
    completedAt: new Date().toISOString(),
    usage: result.usage,
    ...(result.contextUsage !== undefined
      ? { contextUsage: result.contextUsage }
      : {}),
    content:
      completedContent.length !== 0 ? completedContent : active.message.content,
  };
  await persistRunWrite(entry, context.history.save(message));
  entry.activeMessages.delete(message.messageId);
  context.notifications.notify(message.runId, {
    type: "run_message_output",
    runId: message.runId,
    message,
  });
}

/**
 * Persist partial messages without admitting them as successful model-context records.
 * @internal
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} entry - Run that owns the operation.
 * @param {"stopped" | "failed"} status - Final display outcome.
 * @param {string} messageId - Invocation identity when restricting finalization.
 * @param {"user_steering"} cancellationReason - User-requested interruption, when applicable.
 * @returns {Promise<void>} Operation result.
 */
export async function interruptAgentMessages(
  context: RunsContext,
  entry: RunEntry,
  status: "stopped" | "failed",
  messageId?: string,
  cancellationReason?: "user_steering",
): Promise<void> {
  for (const [activeMessageId, active] of entry.activeMessages) {
    if (messageId !== undefined && activeMessageId !== messageId) {
      continue;
    }
    const content: RunContent[] = active.message.content.map((block) => {
      if (block.type !== "tool" || block.status !== RunToolStatus.running) {
        return block;
      }
      return status === "stopped"
        ? {
            ...block,
            status: RunToolStatus.stopped,
            ...(cancellationReason ? { cancellationReason } : {}),
          }
        : {
            ...block,
            status: RunToolStatus.failed,
            output: null,
            error: { code: RunErrorCode.TOOL_EXECUTION_ERROR },
          };
    });
    const message: RunMessage = {
      ...active.message,
      ...(cancellationReason ? { cancellationReason } : {}),
      status:
        status === "stopped"
          ? RunMessageStatus.stopped
          : RunMessageStatus.failed,
      completedAt: new Date().toISOString(),
      content,
    };
    await persistRunWrite(entry, context.history.save(message));
    entry.activeMessages.delete(activeMessageId);
    context.notifications.notify(entry.runId, {
      type: "run_message_output",
      runId: entry.runId,
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
  const entry = context.runs.get(runId);
  if (entry === undefined) {
    throw new Error(`Run not loaded: ${runId}`);
  }
  const message: RunMessage = {
    type: "message",
    messageId: crypto.randomUUID(),
    runId,
    parentRunId: context.identities.get(runId)?.parentRunId,
    role: "user",
    createdAt: new Date().toISOString(),
    status: RunMessageStatus.completed,
    content: [{ type: "text", text }],
  };
  await persistRunWrite(entry, context.history.save(message));
  context.notifications.notify(runId, {
    type: "run_message_output",
    runId,
    message,
  });
}
