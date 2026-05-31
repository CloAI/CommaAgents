import type { Logger } from "../../logger/logger.types";
import type {
  CleanupContext,
  CompletionContext,
  DaemonSystem,
  ErrorContext,
  ExecutionContext,
  StrategyLoadedContext,
  SystemRunContext,
} from "./systems.types";

export async function invokeOnRunStart(
  systems: readonly DaemonSystem[],
  runContext: SystemRunContext,
  logger: Logger,
): Promise<void> {
  for (const system of systems) {
    if (system.onRunStart) {
      try {
        await system.onRunStart(runContext);
      } catch (error) {
        logger.error(
          `System ${system.name} onRunStart failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }
  }
}

export async function invokeOnStrategyLoaded(
  systems: readonly DaemonSystem[],
  strategyContext: StrategyLoadedContext,
  logger: Logger,
): Promise<void> {
  for (const system of systems) {
    if (system.onStrategyLoaded) {
      try {
        await system.onStrategyLoaded(strategyContext);
      } catch (error) {
        logger.error(
          `System ${system.name} onStrategyLoaded failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }
  }
}

export async function invokeOnBeforeExecute(
  systems: readonly DaemonSystem[],
  executionContext: ExecutionContext,
  logger: Logger,
): Promise<void> {
  for (const system of systems) {
    if (system.onBeforeExecute) {
      try {
        await system.onBeforeExecute(executionContext);
      } catch (error) {
        logger.error(
          `System ${system.name} onBeforeExecute failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }
  }
}

export async function invokeOnRunComplete(
  systems: readonly DaemonSystem[],
  completionContext: CompletionContext,
  logger: Logger,
): Promise<void> {
  for (const system of systems) {
    if (system.onRunComplete) {
      try {
        await system.onRunComplete(completionContext);
      } catch (error) {
        logger.warn(
          `System ${system.name} onRunComplete failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

export async function invokeOnRunError(
  systems: readonly DaemonSystem[],
  errorContext: ErrorContext,
  logger: Logger,
): Promise<void> {
  for (const system of systems) {
    if (system.onRunError) {
      try {
        await system.onRunError(errorContext);
      } catch (error) {
        logger.warn(
          `System ${system.name} onRunError failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

export async function invokeOnRunCleanup(
  systems: readonly DaemonSystem[],
  cleanupContext: CleanupContext,
  logger: Logger,
): Promise<void> {
  for (const system of systems) {
    if (system.onRunCleanup) {
      try {
        await system.onRunCleanup(cleanupContext);
      } catch (error) {
        logger.warn(
          `System ${system.name} onRunCleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
