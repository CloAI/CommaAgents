import type {
  PrepareRunOptions,
  PrepareRunResult,
  RunPreparationContext,
} from "../runs.types";
import type {
  RunIdentity,
  RunPreparedSnapshot,
  RunsContext,
} from "../state/state.types";
import {
  RunPhase,
  RunOutcomeStatus,
  RunStrategyDescriptionSchema,
} from "../state/state.schemas";
import {
  createRunEntry,
  getRunSnapshot,
  publishRunState,
} from "../state/state";
import { runSnapshot } from "../state/state.utils";
import { RunConfigurationSchema } from "./preparation.schemas";
import { mergeModelRoles } from "./preparation.utils";
import { loadRunPreparation } from "./loading/loading";
import { cleanupRunEntry } from "./resources/resources";
import { restoredConversation } from "../conversation/conversation";
import { operationError, runError, RunErrorCode } from "../errors";
import { persistRunWrite } from "../history/persistence";
import { updateChildReference } from "../execution/children/children";
/**
 *  Prepare a new or saved conversation under the same domain rules for every caller.
 * @param {RunsContext} context - Private runs state.
 * @param {PrepareRunOptions} options - Operation settings.
 * @param {RunIdentity} identity - Run identity and parent linkage.
 * @returns {Promise<PrepareRunResult>} Prepared or stopped terminal state.
 * @internal
 */
export async function prepareRun(
  context: RunsContext,
  options: PrepareRunOptions,
  identity?: RunIdentity,
): Promise<PrepareRunResult> {
  const runId = identity?.runId ?? options.runId ?? crypto.randomUUID();
  if (context.operations.has(runId)) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  const current = context.runs.get(runId);
  if (current !== undefined && current.state.phase !== RunPhase.terminal) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  const previous =
    options.runId !== undefined
      ? await getRunSnapshot(context, runId)
      : undefined;
  if (
    options.runId !== undefined &&
    previous === undefined &&
    options.configuration?.strategyPath === undefined
  ) {
    throw runError({ code: RunErrorCode.RUN_NOT_FOUND, metadata: { runId } });
  }
  if (
    previous?.phase === RunPhase.terminal &&
    previous.outcome.status === RunOutcomeStatus.failed &&
    previous.outcome.error.code === RunErrorCode.PERSISTENCE_ERROR
  ) {
    throw runError(previous.outcome.error);
  }
  if (context.operations.has(runId)) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  const raced = context.runs.get(runId);
  if (raced !== undefined && raced.state.phase !== RunPhase.terminal) {
    throw runError({ code: RunErrorCode.RUN_BUSY, metadata: { runId } });
  }
  const overrides = options.configuration ?? {};
  const candidate = RunConfigurationSchema.parse({
    ...previous?.configuration,
    ...overrides,
    cwd: overrides.cwd ?? previous?.configuration.cwd ?? process.cwd(),
    manifestPath:
      overrides.manifestPath === null
        ? undefined
        : (overrides.manifestPath ?? previous?.configuration.manifestPath),
    modelRoles:
      overrides.modelRoles === null
        ? undefined
        : mergeModelRoles(
            previous?.configuration.modelRoles,
            overrides.modelRoles,
          ),
  });
  const pending = Promise.withResolvers<PrepareRunResult>();
  const entry = createRunEntry(
    { runId, parentRunId: identity?.parentRunId ?? previous?.parentRunId },
    previous?.configuration ?? candidate,
    { phase: RunPhase.preparing, preparation: pending.promise },
  );
  entry.retryInput = current?.retryInput;
  entry.strategyState = previous?.strategyState;
  entry.description = previous?.strategy ?? null;
  context.runs.set(runId, entry);
  context.identities.set(runId, { runId, parentRunId: entry.parentRunId });
  void prepareEntry();
  return pending.promise;
  async function prepareEntry(): Promise<void> {
    try {
      await publishRunState(context, entry);
      const conversation = await restoredConversation(context, entry);
      const common = { runId, ...candidate, signal: entry.controller.signal };
      const scope: RunPreparationContext =
        entry.parentRunId === undefined
          ? { ...common, kind: "root" }
          : { ...common, kind: "child", parentRunId: entry.parentRunId };
      const strategy = await loadRunPreparation(
        context,
        entry,
        scope,
        conversation,
      );
      entry.controller.signal.throwIfAborted();
      const description = RunStrategyDescriptionSchema.parse({
        name: strategy.name,
        agents: Object.keys(strategy.agents),
        flow: strategy.raw.flow,
      });
      const unmatchedAgents = [
        ...new Set(conversation.records.map((record) => record.agentName)),
      ].filter((agentName) => strategy.agents[agentName] === undefined);
      const snapshot: RunPreparedSnapshot = {
        runId,
        parentRunId: entry.parentRunId,
        configuration: candidate,
        ...(entry.strategyState ? { strategyState: entry.strategyState } : {}),
        strategy: description,
        phase: RunPhase.prepared,
        unmatchedAgents,
      };
      // Keep preparation reserved until its configuration and parent reference are durable.
      await persistRunWrite(entry, context.storage.save(snapshot));
      await updateChildReference(context, snapshot);
      entry.controller.signal.throwIfAborted();
      entry.configuration = candidate;
      entry.description = description;
      entry.state = { phase: RunPhase.prepared, strategy, unmatchedAgents };
      context.notifications.notify(runId, { type: "run_snapshot", snapshot });
      pending.resolve(snapshot);
    } catch (cause) {
      await cleanupRunEntry(entry);
      const stopped = entry.controller.signal.aborted && entry.failure === null;
      let error = stopped
        ? null
        : (entry.failure ??
          operationError(RunErrorCode.PREPARATION_ERROR, runId, cause));
      entry.configuration = previous?.configuration ?? candidate;
      entry.description = previous?.strategy ?? null;
      entry.state = {
        phase: RunPhase.terminal,
        outcome:
          error === null
            ? { status: RunOutcomeStatus.stopped }
            : { status: RunOutcomeStatus.failed, error },
      };
      try {
        await publishRunState(context, entry);
      } catch (cause) {
        error =
          entry.failure ??
          operationError(RunErrorCode.PERSISTENCE_ERROR, runId, cause);
        entry.state = {
          phase: RunPhase.terminal,
          outcome: { status: RunOutcomeStatus.failed, error },
        };
        context.notifications.notify(runId, {
          type: "run_snapshot",
          snapshot: runSnapshot(entry),
        });
      }
      const snapshot = runSnapshot(entry);
      if (snapshot.phase !== RunPhase.terminal) {
        throw new Error("Preparation did not finish");
      }
      if (error === null) {
        pending.resolve(snapshot);
      } else {
        pending.reject(runError(error));
      }
    }
  }
}
