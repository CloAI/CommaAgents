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

    onStrategyLoaded(strategyContext: StrategyLoadedContext): void {
      const { run, strategy, input, cwd } = strategyContext;

      runStore
        .appendEvent(run.id, {
          type: "run_started",
          ts: new Date().toISOString(),
          strategyPath: run.strategyPath,
          strategyName: strategy.name,
          cwd,
          initialInput: input,
        })
        .catch((error) => {
          logger.warn(
            `Failed to append run_started event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    },

    onRunComplete(completionContext: CompletionContext): void {
      const { run } = completionContext;

      runStore
        .appendEvent(run.id, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: "completed",
        })
        .catch((error) => {
          logger.warn(
            `Failed to append run_completed event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    },

    onRunError(errorContext: ErrorContext): void {
      const { run, classified } = errorContext;

      runStore
        .appendEvent(run.id, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: classified.status,
          error: {
            code: classified.code,
            message: classified.message,
          },
        })
        .catch((error) => {
          logger.warn(
            `Failed to append run_completed event for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    },
  };
}
