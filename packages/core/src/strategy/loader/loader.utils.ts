// Strategy loader utilities — internal helpers for agent, model, tool,
// and flow instantiation. Model parsing primitives live in the model/
// module; tool resolution lives in tools/tool.registry.

import { createAgent } from "../../agents/agent/agent";
import type { Agent } from "../../agents/agent/agent.types";
import { createUserAgent } from "../../agents/built-in/user/user-agent";
import { StrategyValidationError } from "../../errors/index";
import { createBroadcastFlow } from "../../flows/built-in/broadcast/broadcast-flow";
import { createCycleFlow } from "../../flows/built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../../flows/built-in/sequential/sequential-flow";
import { hookIntoFlow } from "../../flows/hook-into-flow/hook-into-flow";
import { createPromptTemplate } from "../../prompts/template/prompt-template";
import { createSandbox } from "../../sandbox/sandbox";
import type { Sandbox, SandboxConfig } from "../../sandbox/sandbox.types";
import type { CycleFlowDef, FlowDef, LLMAgentDef, Strategy, UserAgentDef } from "../schema";
import { isAgentStep, isFlowDef, isLLMAgentDef, isUserAgentDef } from "../schema";
import type { LoadStrategyOptions } from "./loader.types";

// Agent instantiation

/**
 * Resolve the sandbox option from LoadStrategyOptions into a single Sandbox
 * instance, constructing one from SandboxConfig when necessary.
 */
function resolveSandbox(options: LoadStrategyOptions): Sandbox | undefined {
  if (!options.sandbox) return undefined;

  // If it already has the Sandbox interface methods, use it directly
  if (typeof (options.sandbox as Sandbox).resolvePath === "function") {
    return options.sandbox as Sandbox;
  }

  // Otherwise treat it as a SandboxConfig and construct the sandbox
  return createSandbox(options.sandbox as SandboxConfig, {
    requestPermission: options.permissionRequester,
  });
}

/**
 * Build all agents defined in the strategy into live Agent instances.
 *
 * Model and tool resolution happen inside createAgent via global
 * registries — the loader only passes string identifiers through.
 */
export async function buildAgentRegistry(
  strategy: Strategy,
  options: LoadStrategyOptions,
): Promise<Record<string, Agent>> {
  const registry: Record<string, Agent> = {};
  const sandbox = resolveSandbox(options);

  for (const [name, agentDefinition] of Object.entries(strategy.agents)) {
    if (isUserAgentDef(agentDefinition)) {
      registry[name] = buildUserAgent(name, agentDefinition, options);
    } else if (isLLMAgentDef(agentDefinition)) {
      registry[name] = buildLLMAgent(name, agentDefinition, options, sandbox);
    }
  }

  return registry;
}

/**
 * Instantiate a user agent from its definition.
 */
function buildUserAgent(
  name: string,
  agentDefinition: UserAgentDef,
  options: LoadStrategyOptions,
): Agent {
  return createUserAgent({
    name,
    requireInput: agentDefinition.config?.requireInput,
    presetMessage: agentDefinition.config?.presetMessage,
    inputCollector: options.inputCollector,
  });
}

/**
 * Instantiate an LLM agent from its definition, passing the model string
 * and tool names directly to createAgent (which resolves them internally).
 */
function buildLLMAgent(
  name: string,
  agentDefinition: LLMAgentDef,
  options: LoadStrategyOptions,
  sandbox?: Sandbox,
): Agent {
  // modelOverride replaces whatever the strategy file specifies
  const effectiveModel = options.modelOverride ?? agentDefinition.model;

  // Model is required for LLM agents
  if (!effectiveModel) {
    throw new StrategyValidationError(
      `Agent "${name}" has no model. Set a model on the agent definition.`,
    );
  }

  // Build system prompt — template takes precedence over static string
  const systemPrompt = agentDefinition.systemPromptTemplate
    ? createPromptTemplate({
        template: agentDefinition.systemPromptTemplate.template,
        variables: agentDefinition.systemPromptTemplate.variables,
      })
    : agentDefinition.systemPrompt;

  // Pass string model and tool names directly — createAgent resolves internally
  return createAgent({
    name,
    model: effectiveModel,
    systemPrompt,
    tools: agentDefinition.tools,
    ...(agentDefinition.providerOptions
      ? { providerOptions: agentDefinition.providerOptions }
      : {}),
    ...(sandbox ? { sandbox } : {}),
  });
}

// Flow tree building

/**
 * Recursively build a flow definition into a runnable Agent.
 *
 * If `options.flowHooks` is provided, hooks are injected into the
 * created flow via `hookIntoFlow()` after construction.
 */
export function buildFlow(
  flowDef: FlowDef,
  agents: Readonly<Record<string, Agent>>,
  options: LoadStrategyOptions,
): Agent {
  const steps = resolveSteps(flowDef.steps, flowDef.name, agents, options);

  let flow: Agent;

  switch (flowDef.type) {
    case "sequential":
      flow = createSequentialFlow({
        name: flowDef.name,
        steps,
      });
      break;

    case "cycle": {
      const cycleDef = flowDef as CycleFlowDef;
      const cycles = cycleDef.cycles === "Infinity" ? Infinity : (cycleDef.cycles ?? 1);

      // Resolve observer agent if specified
      const observer = cycleDef.observer
        ? resolveAgentRef(cycleDef.observer, flowDef.name, agents)
        : undefined;

      flow = createCycleFlow({
        name: flowDef.name,
        steps,
        cycles,
        observer,
      });
      break;
    }

    case "broadcast":
      flow = createBroadcastFlow({
        name: flowDef.name,
        steps,
        separator: (flowDef as { separator?: string }).separator,
      });
      break;
  }

  // Inject flow hooks post-creation via hookIntoFlow
  if (options.flowHooks) {
    hookIntoFlow(flow, options.flowHooks);
  }

  return flow;
}

/**
 * Resolve an array of flow step definitions into live Agent instances.
 * Steps are either agent references or nested flow definitions.
 */
function resolveSteps(
  steps: readonly unknown[],
  flowName: string,
  agents: Readonly<Record<string, Agent>>,
  options: LoadStrategyOptions,
): Agent[] {
  return steps.map((step, index) => {
    if (isAgentStep(step)) {
      return resolveAgentRef(step.agent, flowName, agents);
    }

    if (isFlowDef(step)) {
      return buildFlow(step as FlowDef, agents, options);
    }

    throw new StrategyValidationError(
      `Flow "${flowName}" step ${index} is neither an agent reference nor a flow definition.`,
    );
  });
}

/**
 * Look up a named agent in the registry.
 */
function resolveAgentRef(
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
