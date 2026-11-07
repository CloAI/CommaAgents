import type { RunsContext } from "../state/state.types";
import { RunPhase, RunOutcomeStatus } from "../state/state.schemas";
import { runSnapshot } from "../state/state.utils";
import { prepareRun } from "../preparation/preparation";
import { beginRunExecution } from "../execution/execution";
import { runError, RunErrorCode } from "../errors";
import { restoreAgentContexts } from "../conversation/conversation";
import { SendRunArgumentsSchema } from "../switching/switching.schemas";
import type {
  SendRunOptions,
  SendRunResult,
} from "../switching/switching.types";
import {
  contextMessages,
  estimateTokens,
  handoffRecords,
} from "../switching/switching.utils";
import {
  recentMessages,
  requestEstimate,
  summarizeHandoff,
} from "./submission.utils";

/** Check a continuation's context before executing, acknowledging only accepted model work.
 * @param {RunsContext} context - Run resources and storage.
 * @param {SendRunOptions} options - Draft and optional explicit context decision.
 * @returns {Promise<SendRunResult>} Acceptance or the context alternatives requiring a decision.
 */
export async function sendRun(
  context: RunsContext,
  options: SendRunOptions,
): Promise<SendRunResult> {
  const { runId, input, contextChoice, expectedRevision } =
    SendRunArgumentsSchema.parse(options);
  if (context.operations.has(runId)) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  let entry = context.runs.get(runId);
  if (!entry || entry.state.phase === RunPhase.terminal) {
    await prepareRun(context, { runId });
    entry = context.runs.get(runId);
  }
  if (
    !entry ||
    entry.state.phase !== RunPhase.prepared ||
    context.operations.has(runId)
  ) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  if (
    expectedRevision !== undefined &&
    expectedRevision !== (entry.strategyState?.revision ?? 0)
  ) {
    throw runError({
      code: RunErrorCode.INVALID_RUN_STATE,
      metadata: { runId },
    });
  }
  context.operations.add(runId);
  let locked = true;
  try {
    const { getQualifiedModelMetadata } = await import("@comma-agents/core");
    const strategy = entry.state.strategy;
    const agents = Object.values(strategy.agents).filter(
      (agent) => agent.config?.model,
    );
    const limits = agents.flatMap((agent) => {
      const metadata = getQualifiedModelMetadata(
        agent.config!.model!,
      )?.metadata;
      const limit = metadata?.maxInputTokens ?? metadata?.contextWindow;
      return limit ? [limit] : [];
    });
    // Unknown catalogs use a conservative prompt threshold; Continue can explicitly bypass it.
    const tokenLimit = limits.length ? Math.min(...limits) : 32_768;
    const estimatedTokens = requestEstimate(agents, input);
    const history = await context.history.read(runId);
    const messages = contextMessages(history.entries);
    const throughMessageId = messages.at(-1)?.messageId;
    // The draft is already displayed after a rejected attempt, but is still the next model input.
    if (
      entry.retryInput === input &&
      messages.at(-1)?.speaker === "user" &&
      messages.at(-1)?.text === input
    ) {
      messages.pop();
    }
    const overhead = Math.max(
      8192,
      ...agents.map(
        (agent) =>
          estimateTokens(JSON.stringify(agent.config?.systemPrompt ?? "")) +
          (agent.config?.modelOptions?.maxOutputTokens ?? 4096) +
          2048,
      ),
    );
    const recent = recentMessages(messages, input, tokenLimit, overhead);
    const required = (error?: string): SendRunResult => ({
      type: "context_required",
      estimatedTokens,
      tokenLimit,
      recentCount: recent.length,
      ...(error ? { error } : {}),
    });
    if (estimatedTokens > tokenLimit && !contextChoice) {
      return required();
    }
    if (contextChoice) {
      let retained = contextChoice === "full" ? messages : recent;
      if (contextChoice === "compact") {
        const target = agents[0];
        if (!target?.config?.model) {
          return required(
            "No model is available to compact this conversation.",
          );
        }
        const { applyCompaction } =
          await import("@comma-agents/core/conversation-context");
        // TODO: Decide how the UI should select among core's context-management methods. Use compaction for now.
        const records = handoffRecords(
          messages,
          "handoff",
          entry.strategyState?.revision ?? 0,
        );
        const compacted = await applyCompaction({
          records,
          agentName: "handoff",
          trigger: {
            tokenLimit,
            contextUsage: { totalTokens: tokenLimit },
          },
          options: {
            keepRecent: recent.length,
            summarize: async (older) => {
              return summarizeHandoff(
                target,
                older
                  .map((record) => String(record.userMessage.content))
                  .join("\n\n"),
                tokenLimit,
                entry!,
              );
            },
          },
        });
        retained = compacted.event
          ? [
              {
                messageId: compacted.event.summaryRecord.id,
                speaker: "conversation summary",
                createdAt: compacted.event.createdAt,
                text: compacted.event.summaryRecord.text,
              },
              ...recent,
            ]
          : messages;
      }
      if (
        contextChoice !== "full" &&
        estimateTokens(JSON.stringify(retained) + input) + overhead > tokenLimit
      ) {
        return required(
          "The selected context still exceeds the estimated limit. Choose fewer messages or continue with full history.",
        );
      }
      const previous = entry.strategyState;
      const events = await context.storage.conversation(runId);
      const state = {
        revision: previous?.revision ?? 0,
        changes: previous?.changes ?? [],
        handoff: {
          messages: retained,
          eventOffset: events.length,
          throughMessageId,
        },
      };
      // Commit context selection before changing live agent contexts.
      await context.storage.save({
        ...runSnapshot(entry),
        strategyState: state,
      });
      entry.strategyState = state;
      for (const agent of Object.values(strategy.agents)) {
        agent.getConversationContext?.().clear();
      }
      restoreAgentContexts(
        strategy,
        { records: [], retentionEvents: [] },
        entry,
      );
      context.notifications.notify(runId, {
        type: "run_snapshot",
        snapshot: runSnapshot(entry),
      });
    }
    // Subscribe before starting: a rejected first provider request must keep the user's draft.
    const accepted = Promise.withResolvers<void>();
    const unsubscribers: Array<() => void> = [];
    try {
      unsubscribers.push(
        await context.notifications.subscribe(
          "run_message_stream",
          runId,
          (event) => {
            if (
              event.runId === runId &&
              (event.content.type === "text" ||
              event.content.type === "reasoning"
                ? event.content.text.length > 0
                : true)
            ) {
              accepted.resolve();
            }
          },
        ),
      );
      unsubscribers.push(
        await context.notifications.subscribe(
          "run_input_requested",
          runId,
          (event) => {
            if (event.runId === runId) {
              accepted.resolve();
            }
          },
        ),
      );
      context.operations.delete(runId);
      locked = false;
      const execution = beginRunExecution(context, runId, input);
      const outcome = await Promise.race([
        accepted.promise.then(() => undefined),
        execution.completion,
      ]);
      if (outcome && outcome.status !== RunOutcomeStatus.completed) {
        if (outcome.status === RunOutcomeStatus.failed) {
          if (outcome.error.code !== RunErrorCode.PERSISTENCE_ERROR) {
            entry.retryInput = input;
          }
          throw runError(outcome.error);
        }
        entry.retryInput = input;
        return required(
          "The request stopped before the model accepted it. Your message has been preserved.",
        );
      }
      return { type: "started" };
    } finally {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    }
  } finally {
    if (locked) {
      context.operations.delete(runId);
    }
  }
}
