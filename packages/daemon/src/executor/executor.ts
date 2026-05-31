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
  ): string;

  resumeRun(
    clientId: string,
    runId: string,
    requestId?: string,
    modelOverride?: string,
  ): void;

  continueRun(
    clientId: string,
    runId: string,
    input: string,
    strategyPath?: string,
    requestId?: string,
    modelOverride?: string,
  ): void;

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
  const { state, sink, logger, runStore, bridgeTimeout, modelOverride } =
    options;

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
    strategyPath: string,
    input: string,
    requestId: string | undefined,
    runModelOverride: string | undefined,
    runCwd: string | undefined,
    _manifestPath: string | undefined,
    initialAgentTurns?: Map<string, readonly ConversationTurn[]>,
  ): Promise<void> {
    const systemData = createSystemDataStore();
    const runActionRegistry = createRunActionRegistry();

    const runContext: SystemRunContext = {
      run,
      sink,
      runStore,
      logger,
      clientId: state.getRun(run.id)?.cwd ?? process.cwd(),
      requestId,
      modelOverride: runModelOverride ?? modelOverride,
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

      const inputCollector = systemData.get("inputCollector");
      if (!inputCollector) {
        throw new Error("InputCollector not initialized by systems");
      }

      const strategy = await prepareStrategy({
        strategyPath,
        inputCollector,
        modelOverride: runModelOverride ?? modelOverride,
        cwd: runCwd ?? process.cwd(),
        runId: run.id,
        sink,
        systemData,
        logger,
      });

      await invokeOnStrategyLoaded(
        systems,
        {
          ...runContext,
          strategy,
          input,
          cwd: runCwd ?? process.cwd(),
          initialAgentTurns,
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
    ): string {
      const effectiveCwd = runCwd ?? process.cwd();
      const run = state.createRun(strategyPath, strategyPath, effectiveCwd);

      state.subscribe(clientId, run.id);

      executeRun(
        run,
        strategyPath,
        input ?? "",
        requestId,
        runModelOverride,
        runCwd,
        manifestPath,
      ).catch((error) => {
        logger.error(`Unexpected error in executeRun for ${run.id}: ${error}`);
      });

      return run.id;
    },

    resumeRun(
      clientId: string,
      runId: string,
      requestId?: string,
      runModelOverride?: string,
    ): void {
      logger.info(`resumeRun: client=${clientId} runId=${runId}`);

      const startResuming = async () => {
        const events = await runStore.getEvents(runId);
        const startEvent = events.find((ev) => ev.type === "run_started");
        if (!startEvent || startEvent.type !== "run_started") {
          logger.error(
            `resumeRun failed: run_started event not found for ${runId}`,
          );
          sink.send(clientId, {
            type: "error" as const,
            code: "NOT_FOUND",
            message: `Cannot resume run: start event not found for ${runId}`,
            ts: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
          });
          return;
        }

        const { strategyPath, strategyName, cwd, initialInput, manifestPath } =
          startEvent;

        const run = state.createRun(strategyPath, strategyName, cwd, runId);
        state.subscribe(clientId, run.id);

        const initialAgentTurns = new Map<string, ConversationTurn[]>();
        for (const event of events) {
          if (event.type === "agent_call") {
            const list = initialAgentTurns.get(event.agentName) ?? [];
            list.push({
              agentName: event.agentName,
              userMessage: event.userMessage,
              responseMessages: event.responseMessages,
            });
            initialAgentTurns.set(event.agentName, list);
          }
        }

        await runStore.appendEvent(run.id, {
          type: "run_started",
          ts: run.startedAt.toISOString(),
          strategyPath,
          strategyName,
          cwd,
          initialInput,
          manifestPath,
        });

        const resumeInput =
          initialAgentTurns.size === 0 ? (initialInput ?? "") : "";

        await executeRun(
          run,
          strategyPath,
          resumeInput,
          requestId,
          runModelOverride,
          cwd,
          manifestPath,
          initialAgentTurns,
        );
      };

      startResuming().catch((error) => {
        logger.error(`Unexpected error in resumeRun for ${runId}: ${error}`);
      });
    },

    continueRun(
      clientId: string,
      runId: string,
      input: string,
      newStrategyPath?: string,
      requestId?: string,
      runModelOverride?: string,
    ): void {
      logger.info(
        `continueRun: client=${clientId} runId=${runId} switchStrategy=${newStrategyPath ?? "<same>"}`,
      );

      const startContinuing = async () => {
        const events = await runStore.getEvents(runId);
        const startEvent = events.find((ev) => ev.type === "run_started");
        if (!startEvent || startEvent.type !== "run_started") {
          logger.error(
            `continueRun failed: run_started event not found for ${runId}`,
          );
          sink.send(clientId, {
            type: "error" as const,
            code: "NOT_FOUND",
            message: `Cannot continue run: start event not found for ${runId}`,
            ts: new Date().toISOString(),
            ...(requestId ? { requestId } : {}),
          });
          return;
        }

        const reuseStrategy = newStrategyPath === undefined;
        const strategyPath = newStrategyPath ?? startEvent.strategyPath;
        const strategyName = reuseStrategy
          ? startEvent.strategyName
          : strategyPath;
        const manifestPath = reuseStrategy
          ? startEvent.manifestPath
          : undefined;
        const { cwd } = startEvent;

        const run = state.createRun(strategyPath, strategyName, cwd, runId);
        state.subscribe(clientId, run.id);

        const initialAgentTurns = new Map<string, ConversationTurn[]>();
        for (const event of events) {
          if (event.type === "agent_call") {
            const list = initialAgentTurns.get(event.agentName) ?? [];
            list.push({
              agentName: event.agentName,
              userMessage: event.userMessage,
              responseMessages: event.responseMessages,
            });
            initialAgentTurns.set(event.agentName, list);
          }
        }

        await runStore.appendEvent(run.id, {
          type: "run_started",
          ts: run.startedAt.toISOString(),
          strategyPath,
          strategyName,
          cwd,
          initialInput: input,
          ...(manifestPath ? { manifestPath } : {}),
        });

        await executeRun(
          run,
          strategyPath,
          input,
          requestId,
          runModelOverride,
          cwd,
          manifestPath,
          initialAgentTurns,
        );
      };

      startContinuing().catch((error) => {
        logger.error(`Unexpected error in continueRun for ${runId}: ${error}`);
      });
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
