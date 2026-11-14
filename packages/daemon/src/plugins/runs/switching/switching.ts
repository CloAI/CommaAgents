import { resolve } from "node:path";
import {
  RunPhase,
  RunOutcomeStatus,
  RunStrategyDescriptionSchema,
} from "../state/state.schemas";
import type { RunPreparedSnapshot, RunsContext } from "../state/state.types";
import type { RunPreparationContext } from "../runs.types";
import { createRunEntry, getRunSnapshot } from "../state/state";
import { runSnapshot } from "../state/state.utils";
import { stopRun } from "../execution/execution";
import { cleanupRunEntry } from "../preparation/resources/resources";
import { loadRunPreparation } from "../preparation/loading/loading";
import { mergeModelRoles } from "../preparation/preparation.utils";
import { RunConfigurationSchema } from "../preparation/preparation.schemas";
import {
  restoreAgentContexts,
  restoredConversation,
} from "../conversation/conversation";
import { operationError, runError, RunErrorCode } from "../errors";
import { SwitchStrategyArgumentsSchema } from "./switching.schemas";
import type { SwitchStrategyOptions } from "./switching.types";
import { contextMessages, strategyKey } from "./switching.utils";

/** Stage and durably commit a strategy selection without executing its flow.
 * @param {RunsContext} context - Run resources and storage.
 * @param {SwitchStrategyOptions} options - User selection and active-work decision.
 * @returns {Promise<RunPreparedSnapshot>} Prepared state after the selection is durable.
 */
export async function switchStrategy(
  context: RunsContext,
  options: SwitchStrategyOptions,
): Promise<RunPreparedSnapshot> {
  const { runId, stop, expectedRevision, ...selection } =
    SwitchStrategyArgumentsSchema.parse(options);
  if (context.operations.has(runId)) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  context.operations.add(runId);
  const settled = Promise.withResolvers<void>();
  let candidate: ReturnType<typeof createRunEntry> | undefined;
  try {
    let previous = await getRunSnapshot(context, runId);
    if (!previous) {
      throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
    }
    if (
      expectedRevision !== undefined &&
      expectedRevision !== (previous.strategyState?.revision ?? 0)
    ) {
      throw runError({
        code: RunErrorCode.INVALID_RUN_STATE,
        metadata: { runId },
      });
    }
    if (
      previous.phase === RunPhase.running ||
      previous.phase === RunPhase.preparing
    ) {
      if (!stop) {
        throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
      }
      await stopRun(context, runId);
      previous = (await getRunSnapshot(context, runId))!;
    }
    const oldEntry = context.runs.get(runId);
    const target = {
      strategyPath: resolve(previous.configuration.cwd, selection.strategyPath),
      manifestPath: selection.manifestPath
        ? resolve(previous.configuration.cwd, selection.manifestPath)
        : undefined,
    };
    const sameStrategy =
      strategyKey(target) === strategyKey(previous.configuration);
    const configuration = RunConfigurationSchema.parse({
      ...target,
      cwd: previous.configuration.cwd,
      mcpServerOverrides: previous.configuration.mcpServerOverrides,
      modelRoles:
        selection.modelRoles === null
          ? undefined
          : mergeModelRoles(
              previous.configuration.modelRoles,
              selection.modelRoles,
            ),
    });
    const events = await context.storage.conversation(runId);
    const history = await context.history.read(runId);
    const displayed = contextMessages(history.entries);
    const priorHandoff = previous.strategyState?.handoff;
    const boundary = priorHandoff?.throughMessageId
      ? displayed.findIndex(
          (message) => message.messageId === priorHandoff.throughMessageId,
        )
      : -1;
    const sharedMessages =
      priorHandoff && boundary >= 0
        ? [...priorHandoff.messages, ...displayed.slice(boundary + 1)]
        : displayed;
    const revision =
      (previous.strategyState?.revision ?? 0) + (sameStrategy ? 0 : 1);
    candidate = createRunEntry(
      { runId, parentRunId: previous.parentRunId },
      configuration,
      {
        phase: RunPhase.terminal,
        outcome: { status: RunOutcomeStatus.stopped },
      },
    );
    context.stagedStrategies.set(runId, {
      entry: candidate,
      completion: settled.promise,
    });
    candidate.strategyState = {
      revision,
      changes: [...(previous.strategyState?.changes ?? [])],
      handoff:
        sameStrategy && previous.strategyState
          ? previous.strategyState.handoff
          : {
              messages: sharedMessages,
              eventOffset: events.length,
              throughMessageId: displayed.at(-1)?.messageId,
            },
    };
    const common = {
      runId,
      ...configuration,
      signal: candidate.controller.signal,
      staged: true,
    };
    const scope: RunPreparationContext =
      previous.parentRunId === undefined
        ? { ...common, kind: "root" }
        : { ...common, kind: "child", parentRunId: previous.parentRunId };
    const conversation = await restoredConversation(context, candidate);
    const strategy = await loadRunPreparation(
      context,
      candidate,
      scope,
      conversation,
    );
    candidate.description = RunStrategyDescriptionSchema.parse({
      name: strategy.name,
      agents: Object.keys(strategy.agents),
      flow: strategy.raw.flow,
    });
    candidate.state = {
      phase: RunPhase.prepared,
      strategy,
      unmatchedAgents: [],
    };
    if (!sameStrategy) {
      const change = {
        type: "strategy.changed" as const,
        messageId: crypto.randomUUID(),
        runId,
        createdAt: new Date().toISOString(),
        revision,
        previousName:
          previous.strategy?.name ?? previous.configuration.strategyPath,
        nextName: strategy.name,
        previousStrategyPath: previous.configuration.strategyPath,
        nextStrategyPath: configuration.strategyPath,
      };
      // Reserve chronology first. The marker itself commits atomically with the selection in run.json.
      await context.history.reserve(runId, change.messageId);
      candidate.strategyState.changes.push(change);
      // The switch notice names the loaded strategy, so contexts seeded during loading are rebuilt with it.
      for (const agent of Object.values(strategy.agents)) {
        agent.getConversationContext?.().clear();
      }
      restoreAgentContexts(strategy, conversation, candidate);
    }
    candidate.controller.signal.throwIfAborted();
    const snapshot = runSnapshot(candidate) as RunPreparedSnapshot;
    await context.storage.save(snapshot);
    context.runs.set(runId, candidate);
    for (const activate of candidate.activators) {
      activate();
    }
    context.identities.set(runId, {
      runId,
      parentRunId: candidate.parentRunId,
    });
    candidate = undefined;
    // Old prepared resources are released only after the replacement is durable.
    if (oldEntry) {
      await cleanupRunEntry(oldEntry);
    }
    context.notifications.notify(runId, { type: "run_snapshot", snapshot });
    return snapshot;
  } catch (cause) {
    if (candidate) {
      await cleanupRunEntry(candidate);
    }
    if (cause instanceof Error && "code" in cause) {
      throw cause;
    }
    throw runError(
      operationError(RunErrorCode.PREPARATION_ERROR, runId, cause),
    );
  } finally {
    context.operations.delete(runId);
    context.stagedStrategies.delete(runId);
    settled.resolve();
  }
}
