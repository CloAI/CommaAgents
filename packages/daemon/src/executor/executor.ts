import type {
  ConversationTurn,
  PermissionDecision,
  PolicyPatch,
} from "@comma-agents/core";
import type { Logger } from "../logger";
import type { RunStore } from "../runs";
import type { DaemonState, RunState } from "../state/state.types";
import type { EventSink } from "./event-sink";
import { prepareStrategy } from "./prepare-strategy";
import { createInputSystem } from "./systems/input";
import { createPermissionSystem } from "./systems/permission";
import { createPersistenceSystem } from "./systems/persistence";
import { createQuestionSystem } from "./systems/question";
import { createSandboxSystem } from "./systems/sandbox";
import { createSteeringSystem } from "./systems/steering";
import { createStreamingSystem } from "./systems/streaming";
import { createSubLaunchSystem } from "./systems/sub-launch";
import {
  invokeOnRunCleanup,
  invokeOnRunComplete,
  invokeOnRunError,
  invokeOnRunStart,
  invokeOnStrategyLoaded,
} from "./systems/systems";
import type { DaemonSystem, SystemRunContext } from "./systems/systems.types";
import {
  createRunActionRegistry,
  createSystemDataStore,
} from "./systems/systems.utils";

export interface CreateStrategyExecutorOptions {
  readonly state: DaemonState;
  readonly sink: EventSink;
  readonly logger: Logger;
  readonly runStore: RunStore;
  readonly bridgeTimeout?: number;
  readonly modelOverride?: string;
}

export interface StrategyExecutor {
  startRun(
    clientId: string,
    strategyPath: string,
    input?: string,
    requestId?: string,
    modelOverride?: string,
    cwd?: string,
    manifestPath?: string,
    previousRunId?: string,
  ): string;

  stopRun(runId: string): void;
  steerRun(runId: string, text: string): boolean;

  handleUserInput(runId: string, agentName: string, text: string): boolean;

  handlePermissionDecision(
    runId: string,
    permissionRequestId: string,
    decision: PermissionDecision,
  ): boolean;

  handleQuestionResponse(
    runId: string,
    questionRequestId: string,
    response: string,
  ): boolean;

  handleUpdatePolicy(
    runId: string,
    patch: PolicyPatch,
    toolName?: string,
  ): boolean;
}

export function createStrategyExecutor(
  options: CreateStrategyExecutorOptions,
): StrategyExecutor {
  const {
    state,
    sink,
    logger,
    runStore,
    bridgeTimeout,
    modelOverride: defaultModelOverride,
  } = options;

  const systems: DaemonSystem[] = [
    createInputSystem({ bridgeTimeout }),
    createPermissionSystem({ bridgeTimeout }),
    createQuestionSystem({ bridgeTimeout }),
    createSteeringSystem(),
    createStreamingSystem({ logger, runStore, sink }),
    createPersistenceSystem({ logger, runStore }),
    createSandboxSystem(),
    createSubLaunchSystem(),
  ];

  const runContexts = new Map<string, SystemRunContext>();

  async function executeRun(
    run: RunState,
    clientId: string,
    strategyPath: string,
    input: string,
    requestId: string | undefined,
    runModelOverride: string | undefined,
    runCwd: string | undefined,
    _manifestPath: string | undefined,
    previousRunId?: string,
  ): Promise<void> {
    const systemData = createSystemDataStore();
    const runActionRegistry = createRunActionRegistry();

    const runContext: SystemRunContext = {
      run,
      sink,
      runStore,
      logger,
      clientId,
      requestId,
      modelOverride: runModelOverride ?? defaultModelOverride,
      abortSignal: run.abortController.signal,
      systemData,
      runActionRegistry,
      strategyPath,
      input,
      cwd: runCwd ?? process.cwd(),
    };

    runContexts.set(run.id, runContext);

    try {
      await invokeOnRunStart(systems, runContext, logger);

      if (!systemData.get("inputCollector")) {
        throw new Error("InputCollector not initialized by systems");
      }

      // Load previous conversation context if continuing from a previous run
      let previousTurns: Map<string, ConversationTurn[]> | undefined;
      if (previousRunId) {
        try {
          const events = await runStore.getEvents(previousRunId);
          previousTurns = new Map<string, ConversationTurn[]>();

          for (const event of events) {
            if (event.type === "agent_call") {
              const turns = previousTurns.get(event.agentName) ?? [];
              turns.push({
                agentName: event.agentName,
                userMessage: event.userMessage,
                responseMessages: event.responseMessages,
              });
              previousTurns.set(event.agentName, turns);
            }
          }

          logger.debug(
            `Loaded ${previousTurns.size} agent conversations from previous run ${previousRunId}`,
          );
        } catch (error) {
          logger.warn(
            `Failed to load previous run ${previousRunId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const strategy = await prepareStrategy({
        strategyPath,
        modelOverride: runContext.modelOverride,
        runId: run.id,
        systemData,
        previousTurns,
        logger,
      });

      await invokeOnStrategyLoaded(
        systems,
        {
          ...runContext,
          strategy,
          input,
          cwd: runContext.cwd,
        },
        logger,
      );

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

      const result = await strategy.flow.call(input);

      state.updateRun(run.id, {
        status: "completed",
        completedAt: new Date(),
        result,
      });

      await invokeOnRunComplete(systems, { ...runContext, result }, logger);

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
            ...runContext,
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
      await invokeOnRunCleanup(systems, runContext, logger);
      runContexts.delete(run.id);
    }
  }

  return {
    startRun(
      clientId: string,
      strategyPath: string,
      input?: string,
      requestId?: string,
      runModelOverride?: string,
      runCwd?: string,
      manifestPath?: string,
      previousRunId?: string,
    ): string {
      const effectiveCwd = runCwd ?? process.cwd();
      const run = state.createRun(strategyPath, strategyPath, effectiveCwd);

      state.subscribe(clientId, run.id);

      executeRun(
        run,
        clientId,
        strategyPath,
        input ?? "",
        requestId,
        runModelOverride,
        runCwd,
        manifestPath,
        previousRunId,
      ).catch((error) => {
        logger.error(
          `Failed to execute run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

      return run.id;
    },

    stopRun(runId: string): void {
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
    },

    steerRun(runId: string, text: string): boolean {
      const context = runContexts.get(runId);
      if (!context) return false;

      return context.runActionRegistry.invoke("steer", runId, text);
    },

    handleUserInput(runId: string, agentName: string, text: string): boolean {
      const context = runContexts.get(runId);
      if (!context) return false;

      return context.runActionRegistry.invoke(
        "resolveInput",
        runId,
        agentName,
        text,
      );
    },

    handlePermissionDecision(
      runId: string,
      permissionRequestId: string,
      decision: PermissionDecision,
    ): boolean {
      const context = runContexts.get(runId);
      if (!context) return false;

      return context.runActionRegistry.invoke(
        "resolvePermission",
        runId,
        permissionRequestId,
        decision,
      );
    },

    handleQuestionResponse(
      runId: string,
      questionRequestId: string,
      response: string,
    ): boolean {
      const context = runContexts.get(runId);
      if (!context) return false;

      return context.runActionRegistry.invoke(
        "resolveQuestion",
        runId,
        questionRequestId,
        response,
      );
    },

    handleUpdatePolicy(
      runId: string,
      patch: PolicyPatch,
      toolName?: string,
    ): boolean {
      const context = runContexts.get(runId);
      if (!context) return false;

      return context.runActionRegistry.invoke(
        "updatePolicy",
        runId,
        patch,
        toolName,
      );
    },
  };
}
