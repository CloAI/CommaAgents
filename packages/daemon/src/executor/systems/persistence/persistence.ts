import type { Logger } from "../../logger/logger.types";
import type { RunStore } from "../../runs/runs.types";
import type {
  CompletionContext,
  DaemonSystem,
  ErrorContext,
  StrategyLoadedContext,
} from "../systems.types";

export interface PersistenceSystemOptions {
  readonly logger: Logger;
  readonly runStore: RunStore;
}

export function createPersistenceSystem(
  options: PersistenceSystemOptions,
): DaemonSystem {
  const { logger, runStore } = options;

  return {
    name: "persistence",

    async onStrategyLoaded(
      strategyContext: StrategyLoadedContext,
    ): Promise<void> {
      const {
        run,
        strategy,
        input,
        cwd,
        manifestPath,
        modelOverride,
        previousRunId,
      } = strategyContext;

      try {
        await runStore.appendEvent(run.id, {
          type: "run_started",
          ts: new Date().toISOString(),
          strategyPath: run.strategyPath,
          strategyName: strategy.name,
          cwd,
          initialInput: input,
          ...(manifestPath !== undefined ? { manifestPath } : {}),
          ...(modelOverride !== undefined ? { modelOverride } : {}),
          ...(previousRunId !== undefined ? { previousRunId } : {}),
        });
      } catch (error) {
        logger.warn(
          `Failed to append run_started event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    async onRunComplete(completionContext: CompletionContext): Promise<void> {
      const { run } = completionContext;

      try {
        await runStore.appendEvent(run.id, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: "completed",
        });
      } catch (error) {
        logger.warn(
          `Failed to append run_completed event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    async onRunError(errorContext: ErrorContext): Promise<void> {
      const { run, classified } = errorContext;

      try {
        await runStore.appendEvent(run.id, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: classified.status,
          error: {
            code: classified.code,
            message: classified.message,
          },
        });
      } catch (error) {
        logger.warn(
          `Failed to append run_completed event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
