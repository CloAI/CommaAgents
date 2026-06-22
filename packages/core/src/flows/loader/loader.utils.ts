import type { Agent } from "../../agents/agent/agent.types";
import { StrategyValidationError } from "../../errors";
import type {
  BroadcastFlowDef,
  CycleFlowDef,
  FlowDef,
} from "../../strategy/schema";
import { isAgentStep, isFlowDef } from "../../strategy/schema";
import { createBroadcastFlow } from "../built-in/broadcast/broadcast-flow";
import { createCycleFlow } from "../built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../built-in/sequential/sequential-flow";
import { hookIntoFlow } from "../hook-into-flow/hook-into-flow";
import {
  getRegisteredFlowNames,
  resolveRegisteredFlow,
} from "../registry/flow-registry";
import { BUILT_IN_FLOW_NAMES } from "../registry/flow-registry.constants";
import type { LoadFlowOptions } from "./loader.types";

type BuiltInFlowFactory = (
  definition: FlowDef,
  steps: ReadonlyArray<Agent>,
  resolveAgent: (name: string) => Agent,
) => Agent;

const builtInFlowFactories: Readonly<Record<string, BuiltInFlowFactory>> = {
  sequential(definition, steps) {
    return createSequentialFlow({ name: definition.name, steps });
  },
  cycle(definition, steps, resolveAgent) {
    const cycleDefinition = definition as CycleFlowDef;
    const cycles =
      cycleDefinition.cycles === "Infinity"
        ? Infinity
        : (cycleDefinition.cycles ?? 1);
    const observer = cycleDefinition.observer
      ? resolveAgent(cycleDefinition.observer)
      : undefined;

    return createCycleFlow({
      name: cycleDefinition.name,
      steps,
      cycles,
      ...(observer ? { observer } : {}),
      ...(cycleDefinition.breakCycleSignals
        ? { breakCycleSignals: cycleDefinition.breakCycleSignals }
        : {}),
      ...(cycleDefinition.breakCycleSignalMatch
        ? { breakCycleSignalMatch: cycleDefinition.breakCycleSignalMatch }
        : {}),
    });
  },
  broadcast(definition, steps) {
    const broadcastDefinition = definition as BroadcastFlowDef;
    return createBroadcastFlow({
      name: broadcastDefinition.name,
      steps,
      separator: broadcastDefinition.separator,
    });
  },
};

/** Build a validated declarative flow tree into a runnable agent. */
export function buildFlowFromDescription(
  description: FlowDef,
  options: LoadFlowOptions,
): Agent {
  const resolveAgent = (name: string): Agent =>
    resolveAgentReference(name, description.name, options.agents);
  const steps = description.steps.map((step, stepIndex) => {
    if (isAgentStep(step)) {
      return resolveAgentReference(
        step.agent,
        description.name,
        options.agents,
      );
    }

    if (isFlowDef(step)) {
      return buildFlowFromDescription(step, options);
    }

    throw new StrategyValidationError(
      `Flow "${description.name}" step ${stepIndex} is neither an agent reference nor a flow definition.`,
    );
  });

  const registeredFlow = resolveRegisteredFlow(description.type);
  const builtInFactory = builtInFlowFactories[description.type];
  let flow: Agent;

  if (registeredFlow) {
    flow = registeredFlow.create({
      name: description.name,
      steps,
      config: "config" in description ? (description.config ?? {}) : {},
      resolveAgent,
    });
  } else if (builtInFactory) {
    flow = builtInFactory(description, steps, resolveAgent);
  } else {
    throw new StrategyValidationError(
      `Flow "${description.name}" references unknown flow type "${description.type}". ` +
        `Built-in flows: [${BUILT_IN_FLOW_NAMES.join(", ")}]. ` +
        `Registered flows: [${getRegisteredFlowNames().join(", ") || "(none)"}].`,
    );
  }

  if (options.flowHooks) {
    hookIntoFlow(flow, options.flowHooks);
  }

  return flow;
}

/** Resolve a named agent for a declarative flow instance. */
function resolveAgentReference(
  agentName: string,
  flowName: string,
  agents: Readonly<Record<string, Agent>>,
): Agent {
  const agent = agents[agentName];
  if (!agent) {
    const available = Object.keys(agents).join(", ");
    throw new StrategyValidationError(
      `Flow "${flowName}" references agent "${agentName}" which is not defined. ` +
        `Available agents: [${available}].`,
    );
  }
  return agent;
}
