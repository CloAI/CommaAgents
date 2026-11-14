import {
  prepareRunCommand,
  switchStrategyCommand,
  sendRunCommand,
  startRunCommand,
  stopRunCommand,
  steerRunCommand,
  resolveInputCommand,
  getRunCommand,
  getCopyCheckpointCommand,
  getHistoryCommand,
  listActiveRunsCommand,
  runsChannel,
} from "./server";
import { createPlugin } from "../../daemon-plugin";
import type { CreateNotifyingPluginOptions } from "../../daemon-plugin/notifications/notifications.types";
import type { CreateRunsPluginOptions, RunsPlugin } from "./runs.types";
import type { RunNotifications } from "./runs.notifications";
import type { RunsContext } from "./state/state.types";
import { createRunsContext } from "./state";
import { beginRunExecution, disposeRuns, steerRun, stopRun } from "./execution";
import { getDisplayHistory } from "./history";
import {
  getRunSnapshot,
  listActiveRuns,
  setMcpServerOverride,
} from "./state/state";
import { resolveRunInput } from "./input/input";
import { switchStrategy, sendRun } from "./switching";
import { prepareRun } from "./preparation";
import { getRunLineage } from "./identity";
import {
  copyRun,
  getCopyCheckpoint,
  removeCopiedRuns,
} from "./copying/copying";

/**
 * Create a serverless service for preparing, executing, and continuing runs.
 *
 * @param {CreateRunsPluginOptions} options - Run storage and feature dependencies.
 * @returns {RunsPlugin} The run service and its feature registration methods.
 * @example
 * ```ts
 * const runs = createRunsPlugin({ runsDir });
 * const prepared = await runs.prepareRun({ configuration: { strategyPath } });
 * if (prepared.phase === "prepared") {
 *   const outcome = await runs.startRun(prepared.runId, "Hello").completion;
 * }
 * ```
 */
export function createRunsPlugin(options: CreateRunsPluginOptions) {
  const { plugin, notifications } = createPlugin({
    name: "runs",
    notifications: true,
    get context(): RunsContext {
      return context;
    },
    server: {
      commands: [
        prepareRunCommand,
        switchStrategyCommand,
        sendRunCommand,
        startRunCommand,
        stopRunCommand,
        steerRunCommand,
        resolveInputCommand,
        getRunCommand,
        getCopyCheckpointCommand,
        getHistoryCommand,
        listActiveRunsCommand,
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
  } satisfies CreateNotifyingPluginOptions<
    "runs",
    RunNotifications,
    RunsPlugin,
    RunsContext
  >);
  const context: RunsContext = createRunsContext(options, notifications);
  const methods: Omit<RunsPlugin, keyof typeof plugin> = {
    getCopyCheckpoint: (runId) => getCopyCheckpoint(context, runId),
    copyRun: (options) => copyRun(context, options),
    removeCopiedRuns: (rootIds) => removeCopiedRuns(context, rootIds),
    getRunLineage: (runId) => getRunLineage(context, runId),
    prepareRun: (options) => prepareRun(context, options),
    switchStrategy: (options) => switchStrategy(context, options),
    sendRun: (options) => sendRun(context, options),
    startRun: (runId, input = "") => beginRunExecution(context, runId, input),
    stopRun: (runId) => stopRun(context, runId),
    steerRun: (runId, text, messageId) =>
      steerRun(context, runId, text, messageId),
    resolveInput: (runId, inputId, text) =>
      resolveRunInput(context, runId, inputId, text),
    getRun: (runId) => getRunSnapshot(context, runId),
    setMcpServerOverride: (runId, serverId, enabled) =>
      setMcpServerOverride(context, runId, serverId, enabled),
    listActiveRuns: () => listActiveRuns(context),
    getPendingInputs: (runId) =>
      [...context.runs.values()]
        .filter((entry) =>
          getRunLineage(context, entry.runId).some(
            (identity) => identity.runId === runId,
          ),
        )
        .flatMap((entry) =>
          [...entry.pendingInput].map(([inputId, pending]) => ({
            type: "run_input_requested" as const,
            runId: entry.runId,
            parentRunId: entry.parentRunId,
            inputId,
            agentName: pending.agentName,
            prompt: pending.prompt,
          })),
        ),
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
  };
  return Object.assign(plugin, methods);
}
