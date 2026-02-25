// Strategy loader — parse, validate, and instantiate a strategy file
// into a runnable Agent tree.
//
// The loader:
// 1. Reads JSON or YAML from a file path or raw string.
// 2. Validates the structure with the Zod strategy schema.
// 3. Instantiates agents (LLM-backed or user agents) from definitions.
// 4. Builds the flow tree recursively (sequential / cycle / broadcast).
// 5. Returns a LoadedStrategy with the entry flow as a runnable Agent.
//
// Provider management is external — callers pass a map of
// providerID -> factory function. This keeps auth out of core.

import type { LanguageModel } from "ai";
import YAML from "yaml";

import { createAgent } from "../agents/base-agent";
import type { Agent } from "../agents/types";
import type { InputCollector } from "../agents/user/create-user-agent";
import { createUserAgent } from "../agents/user/create-user-agent";
import { StrategyValidationError } from "../errors/index";
import { createBroadcastFlow } from "../flows/broadcast/broadcast-flow";
import { createCycleFlow } from "../flows/cycle/cycle-flow";
import { createSequentialFlow } from "../flows/sequential/sequential-flow";
import type { AgentHooks, FlowHooks } from "../hooks/types";
import { createPromptTemplate } from "../prompts/template/prompt-template";
import {
  createBashTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createReadTool,
  createWriteTool,
} from "../tools/built-in/index";
import type { ToolDef } from "../tools/tool";
import type {
  AgentDef,
  CycleFlowDef,
  FlowDef,
  LLMAgentDef,
  Strategy,
  StrategyDefaults,
  UserAgentDef,
} from "./schema";
import {
  BUILT_IN_TOOL_NAMES,
  isAgentStep,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
  StrategySchema,
} from "./schema";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A function that creates a LanguageModel from a model ID.
 * Each provider (openai, anthropic, etc.) supplies one of these.
 *
 * @example
 * ```ts
 * import { openai } from "@ai-sdk/openai";
 * const providers = { openai: (id) => openai(id) };
 * ```
 */
export type ProviderFactory = (modelID: string) => LanguageModel;

/**
 * Options for loading a strategy.
 */
export interface LoadStrategyOptions {
  /**
   * Map of providerID to factory function.
   * Keys must match the provider portion of model strings (e.g., "openai" for "openai/gpt-4o").
   */
  readonly providers: Readonly<Record<string, ProviderFactory>>;

  /**
   * Custom tools available beyond the built-in set.
   * Keys are tool names that can be referenced in agent definitions.
   */
  readonly customTools?: Readonly<Record<string, ToolDef>>;

  /**
   * Input collector function for user agents.
   * Required if the strategy contains any user agents with `requireInput: true`.
   */
  readonly inputCollector?: InputCollector;

  /**
   * Abort signal for the entire strategy execution.
   * Passed to all agents and flows that support cancellation.
   */
  readonly abort?: AbortSignal;

  /**
   * Agent hooks to inject into all LLM agents at load time.
   * Useful for the daemon to observe streaming events, call lifecycle, etc.
   */
  readonly agentHooks?: AgentHooks;

  /**
   * Flow hooks to inject into all flows at load time.
   * Useful for the daemon to observe step execution, flow lifecycle, etc.
   */
  readonly flowHooks?: FlowHooks;

  /**
   * Override the model for ALL LLM agents in the strategy.
   *
   * When set, every agent's model string is replaced with this value,
   * regardless of what the strategy file specifies. Format: "providerID/modelID".
   *
   * Useful for the daemon's `--model-override` flag, allowing a single
   * daemon instance to serve any provider/model combination without
   * editing strategy files.
   *
   * @example "github-copilot/gpt-4o"
   */
  readonly modelOverride?: string;
}

/**
 * The result of loading a strategy — contains the runnable flow
 * and metadata for inspection.
 */
export interface LoadedStrategy {
  /** Strategy name from the file. */
  readonly name: string;
  /** Strategy version from the file. */
  readonly version: string;
  /** Optional description. */
  readonly description?: string;
  /** The instantiated entry flow as a runnable Agent. */
  readonly flow: Agent;
  /** The instantiated agent registry (for inspection/testing). */
  readonly agents: Readonly<Record<string, Agent>>;
  /** The raw validated strategy data (for exporting). */
  readonly raw: Strategy;
}

// ---------------------------------------------------------------------------
// Built-in tool factory map
// ---------------------------------------------------------------------------

const BUILT_IN_TOOL_FACTORIES: Readonly<Record<string, () => ToolDef>> = {
  bash: () => createBashTool(),
  read: () => createReadTool(),
  write: () => createWriteTool(),
  edit: () => createEditTool(),
  glob: () => createGlobTool(),
  grep: () => createGrepTool(),
};

// ---------------------------------------------------------------------------
// loadStrategy — from file path
// ---------------------------------------------------------------------------

/**
 * Load a strategy from a JSON or YAML file.
 *
 * Auto-detects format by file extension (`.json`, `.yaml`, `.yml`).
 * Validates the structure, instantiates agents and flows, and returns
 * a runnable `LoadedStrategy`.
 *
 * @param filePath - Absolute or relative path to the strategy file.
 * @param options  - Providers, custom tools, input collector, abort signal.
 * @returns The loaded strategy with a runnable entry flow.
 * @throws {StrategyValidationError} If the file is invalid or missing required fields.
 *
 * @example
 * ```ts
 * import { loadStrategy } from "@comma-agents/core";
 * import { openai } from "@ai-sdk/openai";
 *
 * const strategy = await loadStrategy("./strategy.json", {
 *   providers: { openai: (id) => openai(id) },
 * });
 *
 * const result = await strategy.flow.call("Hello!");
 * ```
 */
export async function loadStrategy(
  filePath: string,
  options: LoadStrategyOptions,
): Promise<LoadedStrategy> {
  // Validate extension first (cheap check)
  const ext = filePath.split(".").pop()?.toLowerCase();

  let format: "json" | "yaml";
  if (ext === "json") {
    format = "json";
  } else if (ext === "yaml" || ext === "yml") {
    format = "yaml";
  } else {
    throw new StrategyValidationError(
      `Unsupported strategy file extension: .${ext}. Use .json, .yaml, or .yml`,
    );
  }

  // Read the file
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new StrategyValidationError(`Strategy file not found: ${filePath}`);
  }

  const content = await file.text();

  return loadStrategyFromString(content, format, options);
}

// ---------------------------------------------------------------------------
// loadStrategyFromString — from raw content
// ---------------------------------------------------------------------------

/**
 * Load a strategy from a raw JSON or YAML string.
 *
 * Useful when the content is already in memory (e.g., received over
 * a WebSocket from the TUI, or from a test fixture).
 *
 * @param content - The raw strategy string.
 * @param format  - "json" or "yaml".
 * @param options - Providers, custom tools, input collector, abort signal.
 * @returns The loaded strategy with a runnable entry flow.
 * @throws {StrategyValidationError} If parsing or validation fails.
 */
export function loadStrategyFromString(
  content: string,
  format: "json" | "yaml",
  options: LoadStrategyOptions,
): LoadedStrategy {
  // 1. Parse raw content
  let raw: unknown;
  try {
    if (format === "json") {
      raw = JSON.parse(content);
    } else {
      raw = YAML.parse(content);
    }
  } catch (err) {
    throw new StrategyValidationError(
      `Failed to parse strategy ${format.toUpperCase()}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // 2. Validate with Zod
  const result = StrategySchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new StrategyValidationError(`Strategy validation failed:\n${issues}`, {
      cause: result.error,
    });
  }

  const strategy = result.data;

  // 3. Instantiate agents
  const agents = buildAgentRegistry(strategy, options);

  // 4. Build the flow tree
  const flow = buildFlow(strategy.flow, agents, options);

  return {
    name: strategy.name,
    version: strategy.version,
    description: strategy.description,
    flow,
    agents,
    raw: strategy,
  };
}

// ---------------------------------------------------------------------------
// Internal: Agent instantiation
// ---------------------------------------------------------------------------

/**
 * Build all agents defined in the strategy into live Agent instances.
 */
function buildAgentRegistry(
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

// ---------------------------------------------------------------------------
// Internal: Model resolution
// ---------------------------------------------------------------------------

/**
 * Parse a "providerID/modelID" string and create a LanguageModel via
 * the provider factory map.
 */
function resolveModel(
  modelString: string,
  agentName: string,
  providers: Readonly<Record<string, ProviderFactory>>,
): LanguageModel {
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

// ---------------------------------------------------------------------------
// Internal: Tool resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal: Flow tree building
// ---------------------------------------------------------------------------

/**
 * Recursively build a flow definition into a runnable Agent.
 */
function buildFlow(
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
