import { getLogger } from "@logtape/logtape";
import type {
  AgentCallFailure,
  AgentCallIdentity,
  AgentCallResult,
  AgentStreamEvent,
} from "@comma-agents/core";
import type { StrategyHookContext } from "../../runs.types";

const logger = getLogger(["comma", "daemon", "execution"]);
const payloadLogger = getLogger(["comma", "daemon", "execution", "payloads"]);

/**
 * Attach invocation and tool diagnostics to every agent in a root or child strategy.
 * @param {StrategyHookContext} context - Prepared strategy and run identity.
 * @param {boolean} logPayloads - Include agent and tool contents in debug records.
 * @returns {void} Hooks are attached in place.
 * @internal
 */
export function attachExecutionLogging(
  context: StrategyHookContext,
  logPayloads = false,
): void {
  for (const [agentName, agent] of Object.entries(context.strategy.agents)) {
    if (agent.appendHook === undefined) {
      continue;
    }
    const agentLogger = logger.with({
      runId: context.runId,
      ...(context.kind === "child" ? { parentRunId: context.parentRunId } : {}),
      agentName,
      model: agent.config?.model,
    });
    const agentPayloadLogger = payloadLogger.with({
      runId: context.runId,
      agentName,
    });
    const started = new Map<string, number>();
    const tools = new Map<
      string,
      {
        messageId?: string;
        toolCallId: string;
        toolName: string;
        startedAt: number;
      }
    >();

    function finishPendingTools(messageId: string | undefined): void {
      for (const [toolKey, tool] of tools) {
        if (tool.messageId !== messageId) {
          continue;
        }
        agentLogger.debug("Tool interrupted", {
          messageId,
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          durationMs: performance.now() - tool.startedAt,
        });
        tools.delete(toolKey);
      }
    }

    agent.appendHook("onCallStarted", (identity: AgentCallIdentity) => {
      started.set(identity.messageId, performance.now());
      agentLogger.debug("Agent invocation started", { ...identity });
      if (agent.config?.privacy?.tee || agent.config?.privacy?.e2ee) {
        agentLogger.debug("Privacy protection enabled", {
          ...identity,
          requirements: agent.config.privacy,
        });
      }
    });
    if (logPayloads) {
      agent.appendHook("beforeCall", (input: string) => {
        agentPayloadLogger.debug("Agent input", {
          input,
          ...(typeof agent.config?.systemPrompt === "string"
            ? { systemPrompt: agent.config.systemPrompt }
            : {}),
        });
      });
    }
    agent.appendHook("onStreamEvent", (event: AgentStreamEvent) => {
      if (event.type !== "tool-call" && event.type !== "tool-result") {
        return;
      }
      const properties = {
        messageId: event.messageId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.mcp ? { mcp: event.mcp } : {}),
      };
      const toolKey = JSON.stringify([event.messageId, event.toolCallId]);
      if (event.type === "tool-call") {
        tools.set(toolKey, {
          messageId: event.messageId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          startedAt: performance.now(),
        });
        agentLogger.debug("Tool started", properties);
        if (logPayloads) {
          agentPayloadLogger.debug("Tool arguments", {
            ...properties,
            args: event.args,
          });
        }
      } else {
        const tool = tools.get(toolKey);
        tools.delete(toolKey);
        const completion = {
          ...properties,
          status: event.status,
          ...(tool ? { durationMs: performance.now() - tool.startedAt } : {}),
          ...(event.error ? { error: event.error } : {}),
          ...(event.cancellationReason
            ? { cancellationReason: event.cancellationReason }
            : {}),
          ...(event.cancellationRequestedBy
            ? { cancellationRequestedBy: event.cancellationRequestedBy }
            : {}),
        };
        if (event.status === "error") {
          agentLogger.error("Tool failed", completion);
        } else {
          agentLogger.debug("Tool completed", completion);
        }
        if (logPayloads) {
          agentPayloadLogger.debug("Tool result", {
            ...properties,
            output: event.output,
          });
        }
      }
    });
    agent.appendHook("onCallCompleted", (result: AgentCallResult) => {
      const startedAt = result.messageId
        ? started.get(result.messageId)
        : undefined;
      if (result.messageId) {
        started.delete(result.messageId);
      }
      finishPendingTools(result.messageId);
      agentLogger.debug("Agent invocation completed", {
        messageId: result.messageId,
        finishReason: result.finishReason,
        usage: result.usage,
        ...(startedAt !== undefined
          ? { durationMs: performance.now() - startedAt }
          : {}),
      });
      if (logPayloads) {
        const record = agent
          .getConversationContext?.()
          .records()
          .find((record) => record.id === result.messageId);
        agentPayloadLogger.debug("Agent response", {
          messageId: result.messageId,
          text: result.text,
          responseMessages: result.responseMessages,
          ...(record ? { userMessage: record.userMessage } : {}),
        });
      }
    });
    agent.appendHook("onCallFailed", (failure: AgentCallFailure) => {
      const startedAt = started.get(failure.messageId);
      started.delete(failure.messageId);
      finishPendingTools(failure.messageId);
      const properties = {
        messageId: failure.messageId,
        cancelled: failure.cancelled,
        error:
          failure.error instanceof Error
            ? failure.error.message
            : String(failure.error),
        ...(startedAt !== undefined
          ? { durationMs: performance.now() - startedAt }
          : {}),
      };
      if (failure.cancelled) {
        agentLogger.debug("Agent invocation cancelled", properties);
      } else {
        agentLogger.error("Agent invocation failed", properties);
      }
    });
  }
}
