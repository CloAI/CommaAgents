import type {
  AgentCallResult,
  ConversationTurn,
  LoadedStrategy,
  TimelineEvent,
} from "@comma-agents/core";
import { prepareStrategy } from "./prepare-strategy";
import { createRunStore } from "./run-store";
import { createInputSystem } from "./systems/input";
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
  CreateRunSystemOptions,
  DaemonSystem,
  ExecutionContext,
  PreparedRunMetadata,
  PrepareRunOptions,
  RunSystem,
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

export function createRunSystem({
  state,
  sink,
  logger,
  runsDir,
  modelOverride: defaultModelOverride,
}: CreateRunSystemOptions): RunSystem {
  const runStore = createRunStore({ runsDir });
  const actions = createRunActionRegistry();
  const preparedRuns = new Map<string, PreparedRun>();
  const cleanupPromises = new Set<Promise<void>>();

  const systems: DaemonSystem[] = [
    createInputSystem(),
    createPermissionSystem(),
    createQuestionSystem(),
    createSkillsSystem(),
    createSteeringSystem(),
    createStreamingSystem({ logger, sink }),
    createPersistenceSystem({ logger: logger.child("persistence"), runStore }),
    createSandboxSystem(),
    createSubLaunchSystem(),
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
    const existingRun = state.getRun(runId);
    const existingSubscribers = existingRun ? state.getSubscribers(runId) : [];

    if (
      existingRun &&
      (existingRun.status === "pending" || existingRun.status === "running")
    ) {
      throw new Error(`Run is still active: ${runId}`);
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

    if (existingRun) state.removeRun(runId);

    const effectiveCwd = options.cwd ?? latestStart?.cwd ?? process.cwd();
    const effectiveModelOverride =
      options.modelOverride ??
      latestStart?.modelOverride ??
      defaultModelOverride;
    const effectiveManifestPath =
      options.manifestPath ?? latestStart?.manifestPath;
    const run = state.createRun(
      strategyPath,
      strategyPath,
      effectiveCwd,
      runId,
    );
    const systemData = createSystemDataStore();
    const context: SystemRunContext = {
      run,
      sink,
      logger,
      clientId,
      modelOverride: effectiveModelOverride,
      abortSignal: run.abortController.signal,
      systemData,
      actions,
      strategyPath,
      cwd: effectiveCwd,
      manifestPath: effectiveManifestPath,
    };

    for (const subscriberId of existingSubscribers) {
      state.subscribe(subscriberId, run.id);
    }
    state.subscribe(clientId, run.id);

    try {
      await invokeOnRunPrepare(systems, context, logger);

      if (!systemData.get("inputCollector")) {
        throw new Error("InputCollector not initialized by systems");
      }

      const strategy = await prepareStrategy({
        strategyPath,
        modelOverride: context.modelOverride,
        runId: run.id,
        systemData,
        logger,
      });

      if (mode === "continuation") {
        restoreAgentContexts(strategy, persistedEvents);
      }

      await invokeOnStrategyLoaded(systems, { ...context, strategy }, logger);
      preparedRuns.set(run.id, { context, strategy, mode });

      return {
        runId: run.id,
        strategyName: strategy.name,
        agents: Object.keys(strategy.agents),
        flowTree: strategy.raw.flow as Record<string, unknown>,
      };
    } catch (error) {
      await invokeOnRunCleanup(systems, context, logger);
      state.removeRun(run.id);
      if (existingRun) {
        const restoredRun = state.createRun(
          existingRun.strategyPath,
          existingRun.strategyName,
          existingRun.cwd,
          existingRun.id,
        );
        state.updateRun(restoredRun.id, {
          status: existingRun.status,
          ...(existingRun.completedAt
            ? { completedAt: existingRun.completedAt }
            : {}),
          ...(existingRun.result ? { result: existingRun.result } : {}),
          ...(existingRun.error ? { error: existingRun.error } : {}),
        });
        for (const subscriberId of existingSubscribers) {
          state.subscribe(subscriberId, restoredRun.id);
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
    if (prepared.execution || prepared.context.run.status !== "pending") {
      throw new Error(`Run already started: ${runId}`);
    }

    state.subscribe(clientId, runId);
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
      state.updateRun(run.id, { status: "running" });

      sink.broadcast(run.id, {
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
      run.abortController.signal.addEventListener("abort", abortFlow, {
        once: true,
      });
      if (run.abortController.signal.aborted) abortFlow();

      let result: AgentCallResult;
      try {
        result = await flowCall;
      } finally {
        run.abortController.signal.removeEventListener("abort", abortFlow);
      }

      state.updateRun(run.id, {
        status: "completed",
        completedAt: new Date(),
        result,
      });

      await invokeOnRunComplete(systems, { ...context, result }, logger);

      sink.broadcast(run.id, {
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

      const existingRun = state.getRun(run.id);
      if (existingRun && existingRun.status !== "cancelled") {
        state.updateRun(run.id, {
          status: errorStatus,
          completedAt: new Date(),
          error: { code: errorCode, message: errorMessage },
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
              status: errorStatus,
              code: errorCode,
              message: errorMessage,
            },
          },
          logger,
        );

        sink.broadcast(run.id, {
          type: "strategy_error",
          runId: run.id,
          error: { code: errorCode, message: errorMessage },
          ts: new Date().toISOString(),
          requestId,
        });
      }
    } finally {
      await invokeOnRunCleanup(systems, prepared.context, logger);
      preparedRuns.delete(run.id);
    }
  }

  function stopRun(runId: string): void {
    const run = state.getRun(runId);
    if (!run) {
      logger.warn(`stopRun: run not found: ${runId}`);
      return;
    }

    run.abortController.abort();

    if (run.status === "pending" || run.status === "running") {
      state.updateRun(runId, {
        status: "cancelled",
        completedAt: new Date(),
        error: {
          code: "CANCELLED",
          message: "Run cancelled by client",
        },
      });

      sink.broadcast(runId, {
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

  return {
    runStore,
    actions,
    prepareRun,
    startRun,
    continueRun,
    stopRun,

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

function findLatestRunStart(
  events: readonly TimelineEvent[],
): Extract<TimelineEvent, { type: "run_started" }> | undefined {
  return [...events]
    .reverse()
    .find(
      (event): event is Extract<TimelineEvent, { type: "run_started" }> =>
        event.type === "run_started",
    );
}

function restoreAgentContexts(
  strategy: LoadedStrategy,
  events: readonly TimelineEvent[],
): void {
  const turnsByAgent = new Map<string, ConversationTurn[]>();
  for (const event of events) {
    if (event.type !== "agent_call") continue;
    const turns = turnsByAgent.get(event.agentName) ?? [];
    turns.push({
      agentName: event.agentName,
      userMessage: event.userMessage,
      responseMessages: event.responseMessages,
    });
    turnsByAgent.set(event.agentName, turns);
  }

  for (const [agentName, agent] of Object.entries(strategy.agents)) {
    const turns = turnsByAgent.get(agentName);
    if (turns && turns.length > 0) {
      agent.getConversationContext?.().restore(turns);
    }
  }
}
