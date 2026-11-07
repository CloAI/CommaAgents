import type { McpServerStatus } from "@comma-agents/core/mcp";
import { getLogger } from "@logtape/logtape";
import type { RunTransitionEffect } from "../../server/daemon-store";
import type {
  CreateRunPersistenceEffectOptions,
  CreateRunProtocolEffectOptions,
} from "./run-effects.types";

const logger = getLogger(["comma", "daemon", "run-effects"]);

/**
 * Log lifecycle transitions observed by one run store.
 * @returns {RunTransitionEffect} A run lifecycle logging effect.
 * @internal
 */
export function createRunLifecycleEffect(): RunTransitionEffect {
  return {
    name: "run-lifecycle-logging",
    handle({ run, transition }): void {
      logger.debug(`Daemon run.${transition.type}`, { runId: run.id });
    },
  };
}

/**
 * Create lifecycle persistence for one prepared execution.
 *
 * @param {CreateRunPersistenceEffectOptions} options - Execution context, persistent repository, and diagnostics.
 * @returns {RunTransitionEffect} Effect that persists lifecycle transitions.
 * @example
 * ```ts
 * runStore.subscribeToTransitions(createRunPersistenceEffect(options));
 * ```
 */
export function createRunPersistenceEffect({
  context,
  runRepository,
}: CreateRunPersistenceEffectOptions): RunTransitionEffect {
  return {
    name: "run-persistence",
    async handle({ transition }): Promise<void> {
      if (transition.type === "running") {
        const enabledMcpServerIds =
          (await runRepository.getRunConfig(context.run.id))
            ?.enabledMcpServerIds ?? [];
        const mcpServers: readonly McpServerStatus[] = (
          context.systemData.get("mcpServerStatuses") ?? []
        ).map((status) => ({
          id: status.id,
          source: status.source,
          transport: status.transport,
          enabled: status.enabled,
          connected: status.connected ?? false,
          toolCount: status.toolCount,
          ...(status.error !== undefined ? { error: status.error } : {}),
        }));
        await runRepository.appendEvent(context.run.id, {
          type: "run_started",
          ts: new Date().toISOString(),
          strategyPath: context.run.strategyPath,
          strategyName: context.strategy.name,
          cwd: context.cwd,
          initialInput: context.input,
          ...(context.manifestPath !== undefined
            ? { manifestPath: context.manifestPath }
            : {}),
          enabledMcpServerIds,
          mcpServers,
        });
        return;
      }

      if (
        transition.type === "completed" ||
        transition.type === "error" ||
        transition.type === "cancelled"
      ) {
        await runRepository.appendEvent(context.run.id, {
          type: "run_completed",
          ts: new Date().toISOString(),
          status: transition.type,
          ...(transition.type === "error" || transition.type === "cancelled"
            ? { error: transition.error }
            : {}),
        });
      }
    },
  };
}

/**
 * Create lifecycle protocol dispatch for one prepared execution.
 *
 * @param {CreateRunProtocolEffectOptions} options - Execution context containing strategy and message delivery.
 * @returns {RunTransitionEffect} Effect that broadcasts lifecycle transitions.
 * @example
 * ```ts
 * runStore.subscribeToTransitions(createRunProtocolEffect({ context }));
 * ```
 */
export function createRunProtocolEffect({
  context,
}: CreateRunProtocolEffectOptions): RunTransitionEffect {
  return {
    name: "run-protocol-dispatch",
    handle({ transition }): void {
      const ts = new Date().toISOString();
      if (transition.type === "running") {
        context.messageSender.broadcast(context.run.id, {
          type: "strategy_started",
          runId: context.run.id,
          strategyName: context.strategy.name,
          agents: Object.keys(context.strategy.agents),
          flowTree: context.strategy.raw.flow as Record<string, unknown>,
          ts,
          requestId: context.requestId,
        });
      } else if (transition.type === "completed") {
        context.messageSender.broadcast(context.run.id, {
          type: "strategy_completed",
          runId: context.run.id,
          result: transition.result.text,
          usage: {
            promptTokens: transition.result.usage.promptTokens,
            completionTokens: transition.result.usage.completionTokens,
          },
          ts,
          requestId: context.requestId,
        });
      } else {
        context.messageSender.broadcast(context.run.id, {
          type: "strategy_error",
          runId: context.run.id,
          error: transition.error,
          ts,
          requestId: context.requestId,
        });
      }
    },
  };
}
