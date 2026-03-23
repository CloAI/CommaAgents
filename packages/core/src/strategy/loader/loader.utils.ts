// Strategy loader utilities — internal helpers for agent, model, tool,
// and flow instantiation. Not exported from the public API.

import { createAgent } from "../../agents/agent/agent";
import type { Agent } from "../../agents/agent/agent.types";
import { createUserAgent } from "../../agents/user/create-user-agent";
import { StrategyValidationError } from "../../errors/index";
import { createBroadcastFlow } from "../../flows/built-in/broadcast/broadcast-flow";
import { createCycleFlow } from "../../flows/built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../../flows/built-in/sequential/sequential-flow";
import { createPromptTemplate } from "../../prompts/template/prompt-template";
import type { ToolDef } from "../../tools/tool.types";
import type { LoadStrategyOptions, ProviderFactory } from "./loader.types";
import type {
  CycleFlowDef,
  FlowDef,
  LLMAgentDef,
  Strategy,
  StrategyDefaults,
  UserAgentDef,
} from "../schema";
import { isAgentStep, isFlowDef, isLLMAgentDef, isUserAgentDef } from "../schema";
import { BUILT_IN_TOOL_FACTORIES, BUILT_IN_TOOL_NAMES } from "../strategy.constants";

// Agent instantiation

/**
 * Build all agents defined in the strategy into live Agent instances.
 */
export function buildAgentRegistry(
  strategy: Strategy,
  options: LoadStrategyOptions,
): Record<string, Agent> {
  const registry: Record<string, Agent> = {};

  for (const [name, def] of Object.entries(strategy.agents)) {
    if (isUserAgentDef(def)) {
      registry[name] = buildUserAgent(name, def, options);
    } else if (isLLMAgentDef(def)) {
      registry[name] = buildLLMAgent(name, def, strategy.defaults, options);
    }
  }

  return registry;
}

/**
 * Instantiate a user agent from its definition.
 */
function buildUserAgent(name: string, def: UserAgentDef, options: LoadStrategyOptions): Agent {
  return createUserAgent({
    name,
    requireInput: def.config?.requireInput,
    presetMessage: def.config?.presetMessage,
    inputCollector: options.inputCollector,
    abort: options.abort,
  });
}

/**
 * Instantiate an LLM agent from its definition, resolving the model
 * via the provider map and tools via the built-in/custom tool registries.
 */
function buildLLMAgent(
  name: string,
  def: LLMAgentDef,
  defaults: StrategyDefaults | undefined,
  options: LoadStrategyOptions,
): Agent {
  // Resolve effective values (useDefaults fills gaps)
  const useDefaults = def.useDefaults === true && defaults !== undefined;

  // modelOverride replaces whatever the strategy file specifies
  const effectiveModel =
    options.modelOverride ?? def.model ?? (useDefaults ? defaults?.model : undefined);
  const effectiveTools = def.tools ?? (useDefaults ? defaults?.tools : undefined);
  const effectiveSystemPrompt =
    def.systemPrompt ?? (useDefaults ? defaults?.systemPrompt : undefined);

  // Model is required for LLM agents
  if (!effectiveModel) {
    throw new StrategyValidationError(
      `Agent "${name}" has no model and useDefaults is ${def.useDefaults ?? false}. ` +
        "Either set a model on the agent or enable useDefaults with a defaults.model defined.",
    );
  }

  // Resolve model via provider map
  const model = resolveModel(effectiveModel, name, options.providers);

  // Resolve tools
  const tools = effectiveTools
    ? resolveTools(effectiveTools, name, options.customTools)
    : undefined;

  // Build system prompt template if defined
  const systemPromptTemplate = def.systemPromptTemplate
    ? createPromptTemplate({
        template: def.systemPromptTemplate.template,
        variables: def.systemPromptTemplate.variables,
      })
    : undefined;

  return createAgent({
    name,
    model,
    systemPrompt: systemPromptTemplate ? undefined : effectiveSystemPrompt,
    systemPromptTemplate,
    tools,
    temperature: def.temperature,
    topP: def.topP,
    maxSteps: def.maxSteps,
    hooks: options.agentHooks,
    abort: options.abort,
  });
}

// Model resolution

/**
 * Parse a "providerID/modelID" string and create a LanguageModel via
 * the provider factory map.
 */
function resolveModel(
  modelString: string,
  agentName: string,
  providers: Readonly<Record<string, ProviderFactory>>,
): import("ai").LanguageModel {
  const slashIndex = modelString.indexOf("/");
  if (slashIndex < 1) {
    throw new StrategyValidationError(
      `Agent "${agentName}" has invalid model string "${modelString}". ` +
        'Expected format: "providerID/modelID" (e.g., "openai/gpt-4o").',
    );
  }

  const providerID = modelString.slice(0, slashIndex);
  const modelID = modelString.slice(slashIndex + 1);

  if (!modelID) {
    throw new StrategyValidationError(
      `Agent "${agentName}" has invalid model string "${modelString}". ` +
        "Model ID is empty after the provider prefix.",
    );
  }

  const factory = providers[providerID];
  if (!factory) {
    throw new StrategyValidationError(
      `Agent "${agentName}" uses provider "${providerID}" but no factory was provided for it. ` +
        `Available providers: [${Object.keys(providers).join(", ")}].`,
    );
  }

  return factory(modelID);
}

// Tool resolution

/**
 * Resolve an array of tool name strings into a Record<string, ToolDef>.
 * Checks built-in tools first, then custom tools.
 */
function resolveTools(
  toolNames: readonly string[],
  agentName: string,
  customTools?: Readonly<Record<string, ToolDef>>,
): Record<string, ToolDef> {
  const tools: Record<string, ToolDef> = {};

  for (const name of toolNames) {
    // Check built-in
    const builtInFactory = BUILT_IN_TOOL_FACTORIES[name];
    if (builtInFactory) {
      tools[name] = builtInFactory();
      continue;
    }

    // Check custom
    const custom = customTools?.[name];
    if (custom) {
      tools[name] = custom;
      continue;
    }

    const builtInList = BUILT_IN_TOOL_NAMES.join(", ");
    const customList = customTools ? Object.keys(customTools).join(", ") : "(none)";
    throw new StrategyValidationError(
      `Agent "${agentName}" references unknown tool "${name}". ` +
        `Built-in tools: [${builtInList}]. Custom tools: [${customList}].`,
    );
  }

  return tools;
}

// Flow tree building

/**
 * Recursively build a flow definition into a runnable Agent.
 */
export function buildFlow(
  flowDef: FlowDef,
  agents: Readonly<Record<string, Agent>>,
  options: LoadStrategyOptions,
): Agent {
  const steps = resolveSteps(flowDef.steps, flowDef.name, agents, options);

  switch (flowDef.type) {
    case "sequential":
      return createSequentialFlow({
        name: flowDef.name,
        steps,
        hooks: options.flowHooks,
        abort: options.abort,
      });

    case "cycle": {
      const cycleDef = flowDef as CycleFlowDef;
      const cycles = cycleDef.cycles === "Infinity" ? Infinity : (cycleDef.cycles ?? 1);

      // Resolve observer agent if specified
      const observer = cycleDef.observer
        ? resolveAgentRef(cycleDef.observer, flowDef.name, agents)
        : undefined;

      return createCycleFlow({
        name: flowDef.name,
        steps,
        cycles,
        observer,
        hooks: options.flowHooks,
        abort: options.abort,
      });
    }

    case "broadcast":
      return createBroadcastFlow({
        name: flowDef.name,
        steps,
        separator: (flowDef as { separator?: string }).separator,
        hooks: options.flowHooks,
        abort: options.abort,
      });
  }
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
