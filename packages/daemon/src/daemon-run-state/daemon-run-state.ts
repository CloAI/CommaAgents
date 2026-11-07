import { getLogger } from "@logtape/logtape";
import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import type { RunStore } from "../server/daemon-store";
import {
  conversationHistoryFromEvents,
  findLatestRunStart,
  restoreAgentContexts,
} from "./daemon-run-state.utils";
import { prepareStrategy } from "./prepare-strategy";
import {
  createRunPersistenceEffect,
  createRunProtocolEffect,
  createRunLifecycleEffect,
} from "./run-effects";
import { createRunRepository } from "./run-repository";
import { createInputSystem } from "./systems/input";
import {
  createMcpSystem,
  listRunMcpStatuses,
  resolveRunMcpConfig,
  updateMcpDefault,
} from "./systems/mcp";
import { createPermissionSystem } from "./systems/permission";
import { createPersistenceSystem } from "./systems/persistence";
import { createQuestionSystem } from "./systems/question";
import { createSandboxSystem } from "./systems/sandbox";
import { createSkillsSystem } from "./systems/skills";
import { createSteeringSystem } from "./systems/steering";
import { createStreamingSystem } from "./systems/streaming";
import { createSubLaunchSystem } from "./systems/sub-launch";
import {
  invokeOnBeforeExecute,
  invokeOnRunCleanup,
  invokeOnRunComplete,
  invokeOnRunError,
  invokeOnRunPrepare,
  invokeOnStrategyLoaded,
} from "./systems/systems";
import type {
  CreateDaemonRunStateOptions,
  DaemonRunState,
  DaemonSystem,
  ExecutionContext,
  PreparedRunMetadata,
  PrepareRunOptions,
  RunActionRegistry,
  SystemRunContext,
} from "./systems/systems.types";
import { createSystemDataStore } from "./systems/systems.utils";

const logger = getLogger(["comma", "daemon", "daemon-run-state"]);

interface PreparedRun {
  readonly runStore: RunStore;
  readonly context: SystemRunContext;
  readonly strategy: LoadedStrategy;
  readonly mode: "new" | "continuation";
  execution?: Promise<void>;
}

const PREPARED_RUN_RUNTIME_KEY = "preparedRun";

/**
 * Create the run lifecycle used by a daemon server.
 *
 * @param {CreateDaemonRunStateOptions} options - Daemon store, protocol delivery, storage, and run defaults.
 * @returns {DaemonRunState} Lifecycle API for preparing and managing daemon runs.
 * @example
 * ```ts
 * const daemonRunState = createDaemonRunState({ daemonStore, messageSender, runsDir });
 * const prepared = await daemonRunState.prepareRun(clientId, { strategyPath });
 * daemonRunState.startRun(clientId, prepared.runId, "Start the task");
 * ```
 */
export function createDaemonRunState({
  daemonStore,
  messageSender,
  runsDir,
  hubManager,
}: CreateDaemonRunStateOptions): DaemonRunState {
  const runRepository = createRunRepository({ runsDir });
  const cleanupPromises = new Set<Promise<void>>();

  const systems: DaemonSystem[] = [
    createInputSystem(),
    createPermissionSystem(),
    createQuestionSystem(),
    createMcpSystem(runRepository),
    createSkillsSystem(),
    createSteeringSystem(),
    createStreamingSystem({ messageSender }),
    createPersistenceSystem({
      runRepository,
    }),
    createSandboxSystem(),
    createSubLaunchSystem(hubManager, runRepository),
  ];

  async function prepareRun(
    clientId: string,
    options: PrepareRunOptions,
  ): Promise<PreparedRunMetadata> {
    const runId = options.runId ?? crypto.randomUUID();
    const registeredRunStore = daemonStore.getRunStore(runId);
    if (
      registeredRunStore?.getRuntimeValue<PreparedRun>(PREPARED_RUN_RUNTIME_KEY)
    ) {
      throw new Error(`Run already exists: ${runId}`);
    }

    const persistedEvents =
      options.runId !== undefined ? await runRepository.getEvents(runId) : [];
    const latestStart = findLatestRunStart(persistedEvents);
    const mode = latestStart ? "continuation" : "new";
    const existingRunStore = daemonStore.getRunStore(runId);
    const existingRun = existingRunStore?.snapshot();
    const existingSubscribers = existingRunStore?.getSubscribers() ?? [];

    if (
      existingRunStore &&
      existingRun &&
      (existingRun.status === "pending" || existingRun.status === "running")
    ) {
      // Attaching to an in-flight run: subscribe this client so live agent
      // streaming reaches it, and return the conversation persisted so far.
      // New and ongoing streaming keeps broadcasting to every subscriber.
      existingRunStore.addSubscriber(clientId);
      const active = existingRunStore.getRuntimeValue<PreparedRun>(
        PREPARED_RUN_RUNTIME_KEY,
      );
      return {
        runId,
        strategyName: active?.strategy.name ?? existingRun.strategyName,
        agents: active ? Object.keys(active.strategy.agents) : [],
        flowTree:
          (active?.strategy.raw.flow as Record<string, unknown> | undefined) ??
          {},
        conversation: conversationHistoryFromEvents(persistedEvents),
        mcpServers: active?.context.systemData.get("mcpServerStatuses") ?? [],
      };
    }
    if (mode === "new" && existingRun) {
      throw new Error(`Run already exists: ${runId}`);
    }
    if (
      mode === "new" &&
      options.runId !== undefined &&
      options.strategyPath === undefined
    ) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (mode === "new" && !options.strategyPath) {
      throw new Error("strategyPath is required when preparing a new run");
    }

    const strategyPath = options.strategyPath ?? latestStart?.strategyPath;
    if (!strategyPath) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (existingRun) {
      daemonStore.removeRun(runId);
    }

    const effectiveCwd = options.cwd ?? latestStart?.cwd ?? process.cwd();
    const effectiveManifestPath =
      options.manifestPath ?? latestStart?.manifestPath;
    const runStore = daemonStore.createRun(
      strategyPath,
      strategyPath,
      effectiveCwd,
      runId,
    );
    runStore.subscribeToTransitions(createRunLifecycleEffect());
    const run = runStore.snapshot();
    const systemData = createSystemDataStore();
    const actions: RunActionRegistry = {
      register(actionName, handler): void {
        runStore.registerAction(actionName, handler);
      },
      invoke(actionName, ...actionArguments): boolean {
        return runStore.invokeAction(actionName, ...actionArguments);
      },
      unregisterAll(): void {
        runStore.clearActions();
      },
    };
    const context: SystemRunContext = {
      run,
      messageSender,
      clientId,
      abortSignal: runStore.abortSignal,
      systemData,
      actions,
      strategyPath,
      cwd: effectiveCwd,
      manifestPath: effectiveManifestPath,
    };

    for (const subscriberId of existingSubscribers) {
      runStore.addSubscriber(subscriberId);
    }
    runStore.addSubscriber(clientId);

    try {
      await invokeOnRunPrepare(systems, context);

      if (!systemData.get("inputCollector")) {
        throw new Error("InputCollector not initialized by systems");
      }

      const strategy = await prepareStrategy({
        strategyPath,
        ...(effectiveManifestPath
          ? { manifestPath: effectiveManifestPath }
          : {}),
        runId: run.id,
        systemData,
        hubManager,
      });

      const conversation = conversationHistoryFromEvents(persistedEvents);
      if (mode === "continuation") {
        restoreAgentContexts(strategy, conversation);
      }

      await invokeOnStrategyLoaded(systems, { ...context, strategy });
      const preparedRun: PreparedRun = { runStore, context, strategy, mode };
      runStore.setRuntimeValue(PREPARED_RUN_RUNTIME_KEY, preparedRun);

      return {
        runId: run.id,
        strategyName: strategy.name,
        agents: Object.keys(strategy.agents),
        flowTree: strategy.raw.flow as Record<string, unknown>,
        conversation,
        mcpServers: systemData.get("mcpServerStatuses") ?? [],
      };
    } catch (error) {
      await invokeOnRunCleanup(systems, context);
      daemonStore.removeRun(run.id);
      if (existingRunStore && existingRun) {
        const restoredRunStore = daemonStore.restoreRun(existingRun);
        for (const subscriberId of existingSubscribers) {
          restoredRunStore.addSubscriber(subscriberId);
        }
      }
      throw error;
    }
  }

  function startRun(
    clientId: string,
    runId: string,
    input = "",
    requestId?: string,
  ): void {
    startPreparedRun(clientId, runId, input, requestId, "new");
  }

  function continueRun(
    clientId: string,
    runId: string,
    input: string,
    requestId?: string,
  ): void {
    startPreparedRun(clientId, runId, input, requestId, "continuation");
  }

  function startPreparedRun(
    clientId: string,
    runId: string,
    input: string,
    requestId: string | undefined,
    expectedMode: PreparedRun["mode"],
  ): void {
    const runStore = daemonStore.getRunStore(runId);
    const prepared = runStore?.getRuntimeValue<PreparedRun>(
      PREPARED_RUN_RUNTIME_KEY,
    );
    if (!prepared) {
      throw new Error(`Prepared run not found: ${runId}`);
    }
    if (prepared.mode !== expectedMode) {
      throw new Error(
        expectedMode === "continuation"
          ? `Run was not prepared for continuation: ${runId}`
          : `Run was prepared for continuation: ${runId}`,
      );
    }
    if (
      prepared.execution ||
      prepared.runStore.snapshot().status !== "pending"
    ) {
      throw new Error(`Run already started: ${runId}`);
    }

    prepared.runStore.addSubscriber(clientId);
    const executionContext: ExecutionContext = {
      ...prepared.context,
      strategy: prepared.strategy,
      input,
      requestId,
    };
    prepared.runStore.subscribeToTransitions(
      createRunPersistenceEffect({
        context: executionContext,
        runRepository,
      }),
    );
    prepared.runStore.subscribeToTransitions(
      createRunProtocolEffect({ context: executionContext }),
    );

    const execution = executeRun(prepared, executionContext);
    prepared.execution = execution;
    void execution.catch((error) => {
      logger.error(
        `Failed to execute run ${runId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async function executeRun(
    prepared: PreparedRun,
    context: ExecutionContext,
  ): Promise<void> {
    const { run, strategy, input } = context;

    try {
      await invokeOnBeforeExecute(systems, context);
      await prepared.runStore.transition({ type: "running" });

      const flowCall = strategy.flow.call(input);
      const abortFlow = (): void => flowCall.abort();
      context.abortSignal.addEventListener("abort", abortFlow, {
        once: true,
      });
      if (context.abortSignal.aborted) {
        abortFlow();
      }

      let result: AgentCallResult;
      try {
        result = await flowCall;
      } finally {
        context.abortSignal.removeEventListener("abort", abortFlow);
      }

      await prepared.runStore.transition({ type: "completed", result });

      await invokeOnRunComplete(systems, { ...context, result });
    } catch (caughtError) {
      const isAbort =
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError";
      const errorStatus = isAbort ? "cancelled" : "error";
      const errorCode = isAbort ? "CANCELLED" : "EXECUTION_ERROR";
      const errorMessage =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);

      const existingRunStore = daemonStore.getRunStore(run.id);
      const existingRun = existingRunStore?.snapshot();
      // stopRun (including during daemon shutdown) may have already marked the
      // run cancelled in memory and broadcast strategy_error. Don't duplicate
      // the daemonStore update or broadcast, but we must still persist the terminal
      // event — otherwise the run has no run_completed in its timeline and is
      // stuck reporting "running" the next time it is listed or reloaded.
      if (existingRunStore && existingRun) {
        const alreadyFinalized = existingRun.status === "cancelled";
        const finalStatus = alreadyFinalized ? "cancelled" : errorStatus;
        const finalCode = alreadyFinalized ? "CANCELLED" : errorCode;

        if (!alreadyFinalized) {
          const runError = { code: finalCode, message: errorMessage };
          if (finalStatus === "cancelled") {
            await existingRunStore.transition({
              type: "cancelled",
              error: runError,
            });
          } else {
            await existingRunStore.transition({
              type: "error",
              error: runError,
            });
          }
        }

        await invokeOnRunError(systems, {
          ...context,
          error:
            caughtError instanceof Error
              ? caughtError
              : new Error(errorMessage),
          classified: {
            status: finalStatus,
            code: finalCode,
            message: errorMessage,
          },
        });
      }
    } finally {
      await invokeOnRunCleanup(systems, prepared.context);
      prepared.runStore.deleteRuntimeValue(PREPARED_RUN_RUNTIME_KEY);
    }
  }

  async function stopRun(runId: string): Promise<void> {
    const runStore = daemonStore.getRunStore(runId);
    if (!runStore) {
      logger.warning(`stopRun: run not found: ${runId}`);
      return;
    }
    const run = runStore.snapshot();

    if (run.status === "pending" || run.status === "running") {
      await runStore.transition({
        type: "cancelled",
        error: {
          code: "CANCELLED",
          message: "Run cancelled by client",
        },
      });
    }

    const prepared = runStore.getRuntimeValue<PreparedRun>(
      PREPARED_RUN_RUNTIME_KEY,
    );
    if (prepared && !prepared.execution) {
      runStore.deleteRuntimeValue(PREPARED_RUN_RUNTIME_KEY);
      const cleanup = invokeOnRunCleanup(systems, prepared.context);
      cleanupPromises.add(cleanup);
      void cleanup.finally(() => cleanupPromises.delete(cleanup));
    }
  }

  async function listMcpServers(
    options: import("./systems/systems.types").ListMcpServersOptions,
  ): Promise<readonly import("./systems/mcp").RunMcpServerStatus[]> {
    const persistedEvents = options.runId
      ? await runRepository.getEvents(options.runId)
      : [];
    const strategyPath =
      options.strategyPath ?? findLatestRunStart(persistedEvents)?.strategyPath;
    const config = await resolveRunMcpConfig({
      strategyPath,
      cwd:
        options.cwd ??
        findLatestRunStart(persistedEvents)?.cwd ??
        process.cwd(),
      runId: options.runId,
      runRepository,
    });
    const preparedStatuses = options.runId
      ? daemonStore
          .getRunStore(options.runId)
          ?.getRuntimeValue<PreparedRun>(PREPARED_RUN_RUNTIME_KEY)
          ?.context.systemData.get("mcpServerStatuses")
      : undefined;
    return listRunMcpStatuses(config, preparedStatuses);
  }

  async function updateMcpServer(
    options: import("./systems/systems.types").UpdateMcpServerOptions,
  ): Promise<readonly import("./systems/mcp").RunMcpServerStatus[]> {
    const persistedEvents = options.runId
      ? await runRepository.getEvents(options.runId)
      : [];
    const strategyPath =
      options.strategyPath ?? findLatestRunStart(persistedEvents)?.strategyPath;
    const cwd =
      options.cwd ?? findLatestRunStart(persistedEvents)?.cwd ?? process.cwd();
    const config = await resolveRunMcpConfig({
      strategyPath,
      cwd,
      runId: options.runId,
      runRepository,
    });

    if (options.scope === "default") {
      updateMcpDefault(config, options.serverId, options.enabled);
    } else {
      if (!options.runId) {
        throw new Error("runId is required for a run-scoped MCP update");
      }
      if (!config.servers.has(options.serverId)) {
        throw new Error(`Unknown MCP server: ${options.serverId}`);
      }
      const enabledIds = new Set(config.enabledServerIds);
      if (options.enabled) {
        enabledIds.add(options.serverId);
      } else {
        enabledIds.delete(options.serverId);
      }
      await runRepository.saveRunConfig(options.runId, {
        enabledMcpServerIds: [...enabledIds],
      });
    }

    return listMcpServers({
      cwd,
      ...(options.runId ? { runId: options.runId } : {}),
      ...(strategyPath ? { strategyPath } : {}),
    });
  }

  return {
    prepareRun,
    startRun,
    continueRun,
    stopRun,
    listMcpServers,
    updateMcpServer,
    listRuns: (filter) => runRepository.listRuns(filter),
    steerRun: (runId, text) =>
      daemonStore.getRunStore(runId)?.invokeAction("steer", text) ?? false,
    resolveInput: (runId, agentName, text) =>
      daemonStore
        .getRunStore(runId)
        ?.invokeAction("resolveInput", agentName, text) ?? false,
    resolvePermission: (runId, permissionRequestId, decision) =>
      daemonStore
        .getRunStore(runId)
        ?.invokeAction("resolvePermission", permissionRequestId, decision) ??
      false,
    resolveQuestion: (runId, questionRequestId, response) =>
      daemonStore
        .getRunStore(runId)
        ?.invokeAction("resolveQuestion", questionRequestId, response) ?? false,
    updatePolicy: (runId, patch, toolName) =>
      daemonStore
        .getRunStore(runId)
        ?.invokeAction("updatePolicy", patch, toolName) ?? false,
    async shutdown(): Promise<void> {
      const executions: Promise<void>[] = [];
      for (const runStore of daemonStore.listRunStores()) {
        const prepared = runStore.getRuntimeValue<PreparedRun>(
          PREPARED_RUN_RUNTIME_KEY,
        );
        if (!prepared) {
          continue;
        }
        if (prepared.execution) {
          executions.push(prepared.execution);
        }
        await stopRun(runStore.id);
      }
      await Promise.allSettled([...executions, ...cleanupPromises]);
    },
  };
}
