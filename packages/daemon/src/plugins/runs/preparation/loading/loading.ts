import type {
  ConversationHistory,
  LoadedStrategy,
  StrategySwitchRequest,
} from "@comma-agents/core";
import type {
  RunPreparationContext,
  StrategyLoaderInputs,
} from "../../runs.types";
import type { RunEntry, RunsContext } from "../../state/state.types";
import { loadRunStrategy } from "./strategy-loader";
import { mergeStrategyInputs } from "./loading.utils";
import { restoreAgentContexts } from "../../conversation/conversation";
import { attachRunHooks } from "../../execution/hooks/hooks";
import { createRunInputCollector } from "../../input/input";
import { executeChildRun } from "../../execution/children/children";
import { getLogger } from "@logtape/logtape";
const logger = getLogger(["comma", "daemon", "plugins", "runs"]);
/**
 *  Acquire services, load one strategy, restore records, and attach instrumentation.
 * @param {RunsContext} context - Private runs state.
 * @param {RunEntry} entry - Run that owns the operation.
 * @param {RunPreparationContext} scope - Resolved preparation settings and cancellation.
 * @param {ConversationHistory} conversation - Restored canonical conversation.
 * @returns {Promise<LoadedStrategy>} Loaded and instrumented strategy.
 * @internal
 */
export async function loadRunPreparation(
  context: RunsContext,
  entry: RunEntry,
  scope: RunPreparationContext,
  conversation: ConversationHistory,
): Promise<LoadedStrategy> {
  const strategyInputs: StrategyLoaderInputs = {};
  const owners = new Map<keyof StrategyLoaderInputs, string>();
  for (const registration of context.preparations) {
    scope.signal.throwIfAborted();
    const prepared = await registration.prepare(scope);
    if (prepared.activate !== undefined) {
      entry.activators.push(prepared.activate);
    }
    if (prepared.dispose !== undefined) {
      entry.disposers.push(prepared.dispose);
    }
    mergeStrategyInputs(
      strategyInputs,
      prepared.strategyInputs,
      owners,
      registration.name,
    );
  }
  scope.signal.throwIfAborted();
  const strategy = await loadRunStrategy({
    ...scope,
    strategyInputs,
    inputCollector: createRunInputCollector(context, entry),
    launchStrategy: (request) => executeChildRun(context, entry, request),
    // Only a root conversation has a user turn to switch at; child runs never receive the handle.
    ...(scope.kind === "root"
      ? {
          requestStrategySwitch: async (request: StrategySwitchRequest) => {
            entry.pendingStrategySwitch = request;
          },
        }
      : {}),
    hubManager: context.hubManager,
    harness: context.harness,
  });
  scope.signal.throwIfAborted();
  // TODO: Review whether Agent should require lifecycle hooks and conversation-context access.
  if (strategy.flow.appendHook === undefined) {
    logger.warning(`Run ${entry.runId}: flow has no lifecycle hooks`);
  }
  for (const [agentName, agent] of Object.entries(strategy.agents)) {
    if (
      agent.appendHook === undefined ||
      agent.getConversationContext === undefined
    ) {
      logger.warning(
        `Run ${entry.runId}: agent ${agentName} cannot provide all streaming and conversation restoration features`,
      );
    }
  }
  restoreAgentContexts(strategy, conversation, entry);
  attachRunHooks(context, entry, strategy);
  for (const registration of context.hooks) {
    scope.signal.throwIfAborted();
    await registration.attach({ ...scope, strategy });
  }
  return strategy;
}
