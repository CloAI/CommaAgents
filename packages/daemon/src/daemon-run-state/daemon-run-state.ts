import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import {
  conversationHistoryFromEvents,
  findLatestRunStart,
  restoreAgentContexts,
} from "./daemon-run-state.utils";
import { prepareStrategy } from "./prepare-strategy";
import { createRunStore } from "./run-store";
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
  SystemRunContext,
} from "./systems/systems.types";
import {
  createRunActionRegistry,
  createSystemDataStore,
} from "./systems/systems.utils";

interface PreparedRun {
  readonly context: SystemRunContext;
  readonly strategy: LoadedStrategy;
  readonly mode: "new" | "continuation";
  execution?: Promise<void>;
}

/**
 * Create the run lifecycle used by a daemon server.
 *
 * @param options - daemonStore, event delivery, logging, storage, and run defaults.
 * @example
 * ```ts
 * const daemonRunState = createDaemonRunState({ daemonStore, messageSender, logger, runsDir });
 * const prepared = await daemonRunState.prepareRun(clientId, { strategyPath });
 * daemonRunState.startRun(clientId, prepared.runId, "Start the task");
 * ```
 */
export function createDaemonRunState({
  daemonStore,
  events,
  messageSender,
  logger,
  runsDir,
  hubManager,
}: CreateDaemonRunStateOptions): DaemonRunState {
  const runStore = createRunStore({ runsDir });
  const actions = createRunActionRegistry();
  const preparedRuns = new Map<string, PreparedRun>();
  const cleanupPromises = new Set<Promise<void>>();

  const systems: DaemonSystem[] = [
    createInputSystem(),
    createPermissionSystem(),
    createQuestionSystem(),
    createMcpSystem(runStore),
    createSkillsSystem(),
    createSteeringSystem(),
    createStreamingSystem({ logger, messageSender }),
    createPersistenceSystem({ logger: logger.child("persistence"), runStore }),
    createSandboxSystem(),
    createSubLaunchSystem(hubManager, runStore),
  ];

  async function prepareRun(
    clientId: string,
    options: PrepareRunOptions,
  ): Promise<PreparedRunMetadata> {
    const runId = options.runId ?? crypto.randomUUID();
    if (preparedRuns.has(runId)) {
      throw new Error(`Run already exists: ${runId}`);
    }

    const persistedEvents =
      options.runId !== undefined ? await runStore.getEvents(runId) : [];
    const latestStart = findLatestRunStart(persistedEvents);
    const mode = latestStart ? "continuation" : "new";
    const existingRun = daemonStore.getRun(runId);
    const existingSubscribers = existingRun
      ? daemonStore.getSubscribers(runId)
      : [];

    if (
      existingRun &&
      (existingRun.status === "pending" || existingRun.status === "running")
    ) {
      // Attaching to an in-flight run: subscribe this client so live agent
      // streaming reaches it, and return the conversation persisted so far.
      // New and ongoing streaming keeps broadcasting to every subscriber.
      daemonStore.subscribe(clientId, runId);
      const active = preparedRuns.get(runId);
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

    if (existingRun) daemonStore.removeRun(runId);

    const effectiveCwd = options.cwd ?? latestStart?.cwd ?? process.cwd();
    const effectiveModelOverride =
      options.modelOverride ?? latestStart?.modelOverride;
    const effectiveManifestPath =
      options.manifestPath ?? latestStart?.manifestPath;
    const run = daemonStore.createRun(
      strategyPath,
      strategyPath,
      effectiveCwd,
      runId,
    );
    const systemData = createSystemDataStore();
    const context: SystemRunContext = {
      run,
      messageSender,
      logger,
      clientId,
      modelOverride: effectiveModelOverride,
      abortSignal: daemonStore.getAbortSignal(run.id),
      systemData,
      actions,
      strategyPath,
      cwd: effectiveCwd,
      manifestPath: effectiveManifestPath,
    };

    for (const subscriberId of existingSubscribers) {
      daemonStore.subscribe(subscriberId, run.id);
    }
    daemonStore.subscribe(clientId, run.id);

    try {
      await invokeOnRunPrepare(systems, context, logger);

      if (!systemData.get("inputCollector")) {
        throw new Error("InputCollector not initialized by systems");
      }

      const strategy = await prepareStrategy({
        strategyPath,
        ...(effectiveManifestPath
          ? { manifestPath: effectiveManifestPath }
          : {}),
        modelOverride: context.modelOverride,
        runId: run.id,
        systemData,
        logger,
        hubManager,
      });

      const conversation = conversationHistoryFromEvents(persistedEvents);
      if (mode === "continuation") restoreAgentContexts(strategy, conversation);

      await invokeOnStrategyLoaded(systems, { ...context, strategy }, logger);
      preparedRuns.set(run.id, { context, strategy, mode });
      events?.publish({ type: "run.runtime.prepared", runId: run.id });

      return {
        runId: run.id,
        strategyName: strategy.name,
        agents: Object.keys(strategy.agents),
        flowTree: strategy.raw.flow as Record<string, unknown>,
        conversation,
        mcpServers: systemData.get("mcpServerStatuses") ?? [],
      };
    } catch (error) {
      await invokeOnRunCleanup(systems, context, logger);
      daemonStore.removeRun(run.id);
      if (existingRun) {
        const restoredRun = daemonStore.restoreRun(existingRun);
        for (const subscriberId of existingSubscribers) {
          daemonStore.subscribe(subscriberId, restoredRun.id);
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
    const prepared = preparedRuns.get(runId);
    if (!prepared) throw new Error(`Prepared run not found: ${runId}`);
    if (prepared.mode !== expectedMode) {
      throw new Error(
        expectedMode === "continuation"
          ? `Run was not prepared for continuation: ${runId}`
          : `Run was prepared for continuation: ${runId}`,
      );
    }
    if (prepared.execution || daemonStore.getRun(runId)?.status !== "pending") {
      throw new Error(`Run already started: ${runId}`);
    }

    daemonStore.subscribe(clientId, runId);
    const executionContext: ExecutionContext = {
      ...prepared.context,
      strategy: prepared.strategy,
      input,
      requestId,
    };

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
    const { run, strategy, input, requestId } = context;

    try {
      await invokeOnBeforeExecute(systems, context, logger);
      daemonStore.startRun(run.id);
      events?.publish({ type: "run.runtime.started", runId: run.id });

      messageSender.broadcast(run.id, {
        type: "strategy_started",
        runId: run.id,
        strategyName: strategy.name,
        agents: Object.keys(strategy.agents),
        flowTree: strategy.raw.flow as Record<string, unknown>,
        ts: new Date().toISOString(),
        requestId,
      });

      const flowCall = strategy.flow.call(input);
      const abortFlow = (): void => flowCall.abort();
      context.abortSignal.addEventListener("abort", abortFlow, {
        once: true,
      });
      if (context.abortSignal.aborted) abortFlow();

      let result: AgentCallResult;
      try {
        result = await flowCall;
      } finally {
        context.abortSignal.removeEventListener("abort", abortFlow);
      }

      daemonStore.completeRun(run.id, result);
      events?.publish({
        type: "run.runtime.finished",
        runId: run.id,
        status: "completed",
      });

      await invokeOnRunComplete(systems, { ...context, result }, logger);

      messageSender.broadcast(run.id, {
        type: "strategy_completed",
        runId: run.id,
        result: result.text,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
        ts: new Date().toISOString(),
        requestId,
      });
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

      const existingRun = daemonStore.getRun(run.id);
      // stopRun (including during daemon shutdown) may have already marked the
      // run cancelled in memory and broadcast strategy_error. Don't duplicate
      // the daemonStore update or broadcast, but we must still persist the terminal
      // event — otherwise the run has no run_completed in its timeline and is
      // stuck reporting "running" the next time it is listed or reloaded.
      if (existingRun) {
        const alreadyFinalized = existingRun.status === "cancelled";
        const finalStatus = alreadyFinalized ? "cancelled" : errorStatus;
        const finalCode = alreadyFinalized ? "CANCELLED" : errorCode;

        if (!alreadyFinalized) {
          const runError = { code: finalCode, message: errorMessage };
          if (finalStatus === "cancelled") {
            daemonStore.cancelRun(run.id, runError);
          } else {
            daemonStore.failRun(run.id, runError);
          }
        }

        events?.publish({
          type: "run.runtime.finished",
          runId: run.id,
          status: finalStatus,
        });

        await invokeOnRunError(
          systems,
          {
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
          },
          logger,
        );

        if (!alreadyFinalized) {
          messageSender.broadcast(run.id, {
            type: "strategy_error",
            runId: run.id,
            error: { code: finalCode, message: errorMessage },
            ts: new Date().toISOString(),
            requestId,
          });
        }
      }
    } finally {
      await invokeOnRunCleanup(systems, prepared.context, logger);
      preparedRuns.delete(run.id);
    }
  }

  function stopRun(runId: string): void {
    const run = daemonStore.getRun(runId);
    if (!run) {
      logger.warn(`stopRun: run not found: ${runId}`);
      return;
    }

    if (run.status === "pending" || run.status === "running") {
      daemonStore.cancelRun(runId);

      messageSender.broadcast(runId, {
        type: "strategy_error",
        runId,
        error: {
          code: "CANCELLED",
          message: "Run cancelled by client",
        },
        ts: new Date().toISOString(),
      });
    }

    const prepared = preparedRuns.get(runId);
    if (prepared && !prepared.execution) {
      preparedRuns.delete(runId);
      const cleanup = invokeOnRunCleanup(systems, prepared.context, logger);
      cleanupPromises.add(cleanup);
      void cleanup.finally(() => cleanupPromises.delete(cleanup));
    }
  }

  async function listMcpServers(
    options: import("./systems/systems.types").ListMcpServersOptions,
  ): Promise<readonly import("./systems/mcp").RunMcpServerStatus[]> {
    const persistedEvents = options.runId
      ? await runStore.getEvents(options.runId)
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
      runStore,
    });
    const preparedStatuses = options.runId
      ? preparedRuns
          .get(options.runId)
          ?.context.systemData.get("mcpServerStatuses")
      : undefined;
    return listRunMcpStatuses(config, preparedStatuses);
  }

  async function updateMcpServer(
    options: import("./systems/systems.types").UpdateMcpServerOptions,
  ): Promise<readonly import("./systems/mcp").RunMcpServerStatus[]> {
    const persistedEvents = options.runId
      ? await runStore.getEvents(options.runId)
      : [];
    const strategyPath =
      options.strategyPath ?? findLatestRunStart(persistedEvents)?.strategyPath;
    const cwd =
      options.cwd ?? findLatestRunStart(persistedEvents)?.cwd ?? process.cwd();
    const config = await resolveRunMcpConfig({
      strategyPath,
      cwd,
      runId: options.runId,
      runStore,
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
      if (options.enabled) enabledIds.add(options.serverId);
      else enabledIds.delete(options.serverId);
      await runStore.saveRunConfig(options.runId, {
        enabledMcpServerIds: [...enabledIds],
      });
    }

    events?.publish({
      type: "mcp.runtime.updated",
      ...(options.runId ? { runId: options.runId } : {}),
      serverId: options.serverId,
      enabled: options.enabled,
    });

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
    listRuns: (filter) => runStore.listRuns(filter),
    steerRun: (runId, text) => actions.invoke("steer", runId, text),
    resolveInput: (runId, agentName, text) =>
      actions.invoke("resolveInput", runId, agentName, text),
    resolvePermission: (runId, permissionRequestId, decision) =>
      actions.invoke("resolvePermission", runId, permissionRequestId, decision),
    resolveQuestion: (runId, questionRequestId, response) =>
      actions.invoke("resolveQuestion", runId, questionRequestId, response),
    updatePolicy: (runId, patch, toolName) =>
      actions.invoke("updatePolicy", runId, patch, toolName),

    async shutdown(): Promise<void> {
      const executions: Promise<void>[] = [];
      for (const [runId, prepared] of preparedRuns) {
        if (prepared.execution) executions.push(prepared.execution);
        stopRun(runId);
      }
      await Promise.allSettled([...executions, ...cleanupPromises]);
    },
  };
}
