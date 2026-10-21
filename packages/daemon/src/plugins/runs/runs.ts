import {
  prepareRunCommand,
  startRunCommand,
  stopRunCommand,
  continueRunCommand,
  steerRunCommand,
  resolveInputCommand,
  getRunCommand,
  getHistoryCommand,
  runsChannel,
} from "./server";
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
import { getDisplayHistory, getRunSnapshot } from "./history";
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
  const { plugin, notifications } = createPlugin<
    "runs",
    RunNotifications,
    RunsPlugin,
    RunsContext
  >({
    name: "runs",
    notifications: true,
    get context() {
      return context;
    },
    server: {
      commands: [
        prepareRunCommand,
        startRunCommand,
        stopRunCommand,
        continueRunCommand,
        steerRunCommand,
        resolveInputCommand,
        getRunCommand,
        getHistoryCommand,
      ],
      channels: [runsChannel],
    },
    cleanup: () => disposeRuns(context),
    notificationHooks: {
      getRecipientKeys: (runId) =>
        context.identities.has(runId)
          ? getRunLineage(context, runId).map((identity) => identity.runId)
          : [runId],
    },
  });
  const context: RunsContext = createRunsContext(options, notifications);
  return Object.assign(plugin, {
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
    getHistory: (runId, options) => getDisplayHistory(context, runId, options),
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
  } satisfies Omit<RunsPlugin, keyof typeof plugin>);
}
