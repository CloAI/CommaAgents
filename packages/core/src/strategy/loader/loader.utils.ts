import { isAbsolute, resolve } from "node:path";

import { createAgent } from "../../agents/agent/agent";
import type { Agent } from "../../agents/agent/agent.types";
import { createUserAgent } from "../../agents/built-in/user/user-agent";
import { StrategyValidationError } from "../../errors/index";
import { createBroadcastFlow } from "../../flows/built-in/broadcast/broadcast-flow";
import { createCycleFlow } from "../../flows/built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../../flows/built-in/sequential/sequential-flow";
import { hookIntoFlow } from "../../flows/hook-into-flow/hook-into-flow";
import type { Guard } from "../../guard/guard.types";
import {
  createPromptTemplate,
  type PromptTemplate,
} from "../../prompts/template/prompt-template";
import { buildSkillsPromptHeader } from "../../skills/skills.loader";
import type { SkillRegistry } from "../../skills/skills.types";
import {
  buildToolSystemPrompt,
  mergeSystemPrompts,
} from "../../tools/build-tool-system-prompt";
import { resolveTools } from "../../tools/tool.registry";
import type {
  CycleFlowDef,
  FlowDef,
  LLMAgentDef,
  Strategy,
  UserAgentDef,
} from "../schema";
import {
  isAgentStep,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
} from "../schema";
import type { LoadStrategyOptions } from "./loader.types";

// Agent instantiation

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

  for (const [name, agentDefinition] of Object.entries(strategy.agents)) {
    if (isUserAgentDef(agentDefinition)) {
      registry[name] = buildUserAgent(name, agentDefinition, options);
    } else if (isLLMAgentDef(agentDefinition)) {
      registry[name] = await buildLLMAgent(name, agentDefinition, options);
    }

    // Hydrate agent if we have prior turns to replay
    if (options.initialAgentTurns?.has(name)) {
      const turns = options.initialAgentTurns.get(name)!;
      registry[name]?.hydrateForReplay?.(turns);
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
 * Create a minimal guard for building tool system prompts.
 * This guard is not fully functional - it's only used to satisfy
 * the ToolContext type when building system prompts at agent creation.
 */
function createMinimalGuard(cwd: string): Guard {
  return {
    toolName: "unknown",
    cwd,
    trashMetadata: undefined,
    authorize: async () => {
      throw new Error("Minimal guard - not for authorization");
    },
    canAccess: () => false,
    addPolicy: () => {},
    removePolicy: () => false,
    getPolicies: () => ({ toolName: "unknown", policies: [] }),
    onPolicyChange: () => () => {},
  };
}

/**
 * Instantiate an LLM agent from its definition, passing the model string
 * and tool names directly to createAgent (which resolves them internally).
 */
async function buildLLMAgent(
  name: string,
  agentDefinition: LLMAgentDef,
  options: LoadStrategyOptions,
): Promise<Agent> {
  // modelOverride replaces whatever the strategy file specifies
  const effectiveModel = options.modelOverride ?? agentDefinition.model;

  // Model is required for LLM agents
  if (!effectiveModel) {
    throw new StrategyValidationError(
      `Agent "${name}" has no model. Set a model on the agent definition.`,
    );
  }

  // Build system prompt — template takes precedence over static string.
  // When a skill registry is supplied, prepend a compact "## Available
  // Skills" block to string prompts so the model knows what it can call
  // `load_skill` with. Template-based prompts are left untouched so
  // authors retain full control over template variables and ordering.
  const skillsHeader = options.skillRegistry
    ? buildSkillsPromptHeader(options.skillRegistry)
    : "";

  // Resolve tool definitions early so we can collect system prompt contributions
  const toolDefinitions = agentDefinition.tools
    ? resolveTools(agentDefinition.tools, name)
    : undefined;

  // Collect tool system prompt contributions
  let toolSystemPrompt: string | undefined;
  if (toolDefinitions) {
    // Create a minimal ToolContext for dynamic systemPrompt functions
    // Note: guard is minimal - systemPrompt functions should not rely on
    // guard authorization at agent creation time
    const minimalGuard = createMinimalGuard("");
    const toolContext: ToolContext = {
      agentName: name,
      abort: AbortSignal.timeout(5000),
      guard: minimalGuard,
      ...(options.skillRegistry
        ? { skillRegistry: options.skillRegistry }
        : {}),
    };

    toolSystemPrompt = await buildToolSystemPrompt({
      toolDefinitions,
      toolContext,
    });
  }

  // Resolve file paths for systemPrompt and systemPromptTemplate if they point to .txt or .md files
  let resolvedSystemPrompt = agentDefinition.systemPrompt;
  if (
    resolvedSystemPrompt &&
    (resolvedSystemPrompt.endsWith(".txt") ||
      resolvedSystemPrompt.endsWith(".md"))
  ) {
    let resolvedPath = resolvedSystemPrompt;
    if (!isAbsolute(resolvedSystemPrompt)) {
      if (options.strategyDir) {
        resolvedPath = resolve(options.strategyDir, resolvedSystemPrompt);
      } else {
        resolvedPath = resolve(resolvedSystemPrompt);
      }
    }
    const file = Bun.file(resolvedPath);
    if (!(await file.exists())) {
      throw new StrategyValidationError(
        `System prompt file not found: ${resolvedPath}`,
      );
    }
    resolvedSystemPrompt = await file.text();
  }

  let resolvedTemplate = agentDefinition.systemPromptTemplate?.template;
  if (
    resolvedTemplate &&
    (resolvedTemplate.endsWith(".txt") || resolvedTemplate.endsWith(".md"))
  ) {
    let resolvedPath = resolvedTemplate;
    if (!isAbsolute(resolvedTemplate)) {
      if (options.strategyDir) {
        resolvedPath = resolve(options.strategyDir, resolvedTemplate);
      } else {
        resolvedPath = resolve(resolvedTemplate);
      }
    }
    const file = Bun.file(resolvedPath);
    if (!(await file.exists())) {
      throw new StrategyValidationError(
        `System prompt template file not found: ${resolvedPath}`,
      );
    }
    resolvedTemplate = await file.text();
  }

  // Build base prompt (template or static + skills header)
  let basePrompt: string | PromptTemplate | undefined;
  if (agentDefinition.systemPromptTemplate) {
    // For PromptTemplate, we'll merge tool prompts into the template string
    basePrompt = createPromptTemplate({
      template:
        resolvedTemplate ?? agentDefinition.systemPromptTemplate.template,
      variables: agentDefinition.systemPromptTemplate.variables,
    });
  } else {
    basePrompt = prependSkillsHeader(resolvedSystemPrompt, skillsHeader);
  }

  // Merge: base prompt + tool contributions
  let systemPrompt: string | PromptTemplate | undefined;
  if (toolSystemPrompt && basePrompt) {
    if (typeof basePrompt === "string") {
      // Both are strings - merge directly
      systemPrompt = mergeSystemPrompts([basePrompt, toolSystemPrompt]);
    } else {
      // basePrompt is a PromptTemplate - append tool prompt to template
      const _template = basePrompt as PromptTemplate;
      // Create a new template with tool prompt appended
      systemPrompt = createPromptTemplate({
        template: `${resolvedTemplate ?? agentDefinition.systemPromptTemplate?.template}\n\n${toolSystemPrompt}`,
        variables: agentDefinition.systemPromptTemplate?.variables,
      });
    }
  } else {
    systemPrompt = basePrompt;
  }

  // Pass string model and tool names directly — createAgent resolves internally
  return createAgent({
    name,
    model: effectiveModel,
    systemPrompt,
    tools: agentDefinition.tools,
    ...(agentDefinition.providerOptions
      ? { providerOptions: agentDefinition.providerOptions }
      : {}),
    ...(agentDefinition.modelOptions
      ? { modelOptions: agentDefinition.modelOptions }
      : {}),
    ...(options.skillRegistry ? { skillRegistry: options.skillRegistry } : {}),
    ...(options.inputCollector
      ? { inputCollector: options.inputCollector }
      : {}),
    ...(options.launchStrategy
      ? { launchStrategy: options.launchStrategy }
      : {}),
  });
}

/**
 * Concatenate the skills header onto a static system prompt. Used by
 * `buildLLMAgent` so callers don't have to remember to inject skills into
 * every prompt themselves.
 */
function prependSkillsHeader(
  systemPrompt: string | undefined,
  skillsHeader: string,
): string | undefined {
  if (skillsHeader.length === 0) return systemPrompt;
  if (!systemPrompt || systemPrompt.length === 0) return skillsHeader;
  return `${systemPrompt}\n\n${skillsHeader}`;
}

/** @internal Used by tests to assert the header gets attached. */
export function previewSkillsHeader(registry: SkillRegistry): string {
  return buildSkillsPromptHeader(registry);
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
      const cycles =
        cycleDef.cycles === "Infinity" ? Infinity : (cycleDef.cycles ?? 1);

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
