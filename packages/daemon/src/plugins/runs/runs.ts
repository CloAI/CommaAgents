import { createPlugin } from "../../daemon-plugin";
import type { CreateRunsPluginOptions, RunsPlugin } from "./runs.types";
import type { RunNotifications } from "./runs.notifications";
import type { RunsContext } from "./state/state.types";
import { createRunsContext } from "./state";
import {
  beginRunExecution,
  disposeRuns,
  resolveRunInput,
  steerRun,
  stopRun,
} from "./execution";
import { getRunHistory, getRunSnapshot } from "./history";
import { prepareRun } from "./preparation";
import { getRunLineage } from "./identity";

/**
 * Create a serverless service for preparing, executing, and continuing runs.
 *
 * @param {CreateRunsPluginOptions} options - Run storage and feature dependencies.
 * @returns {RunsPlugin} The run service and its feature registration methods.
 * @example
 * ```ts
 * const runs = createRunsPlugin({ runsDir });
 * const prepared = await runs.prepareRun({ strategyPath });
 * if (prepared.phase === "prepared") {
 *   const outcome = await runs.startRun(prepared.runId, "Hello").completion;
 * }
 * ```
 */
export function createRunsPlugin(options: CreateRunsPluginOptions): RunsPlugin {
  const { plugin, notifications } = createPlugin<"runs", RunNotifications>({
    name: "runs",
    notifications: true,
    cleanup: () => disposeRuns(context),
    notificationHooks: {
      getRecipientKeys: (runId) =>
        context.identities.has(runId)
          ? getRunLineage(context, runId).map((identity) => identity.runId)
          : [runId],
      beforeSubscribe: async (type, runId) => {
        if (type === "run_snapshot") await getRunSnapshot(context, runId);
      },
      onSubscribe: (type, runId, deliver) => {
        if (type !== "run_snapshot") return;
        const snapshot = context.runs.get(runId)?.snapshot;
        if (snapshot) deliver({ type: "run_snapshot", snapshot });
      },
    },
  });
  const context: RunsContext = createRunsContext(options, notifications);
  return {
    ...plugin,
    getRunLineage: (runId) => getRunLineage(context, runId),
    prepareRun: (options) => prepareRun(context, options),
    startRun: (runId, input = "") =>
      beginRunExecution(context, runId, input, "new"),
    stopRun: (runId) => stopRun(context, runId),
    continueRun: (runId, input) =>
      beginRunExecution(context, runId, input, "continuation"),
    steerRun: (runId, text) => steerRun(context, runId, text),
    resolveInput: (runId, requestId, text) =>
      resolveRunInput(context, runId, requestId, text),
    getRun: (runId) => getRunSnapshot(context, runId),
    getHistory: (runId) => getRunHistory(context, runId),
    registerRunPreparation: (registration): void => {
      if (
        context.preparations.some(
          (existing) => existing.name === registration.name,
        )
      ) {
        throw new Error(`Duplicate run registration: ${registration.name}`);
      }
      context.preparations.push(registration);
    },
    registerStrategyHooks: (registration): void => {
      if (
        context.hooks.some((existing) => existing.name === registration.name)
      ) {
        throw new Error(`Duplicate run registration: ${registration.name}`);
      }
      context.hooks.push(registration);
    },
  };
}
