// Strategy loader utilities — internal helpers for agent, model, tool,
// and flow instantiation. parseModel and KNOWN_PROVIDERS are re-exported
// from the public API via the strategy barrel.

import { createAgent } from "../../agents/agent/agent";
import type { Agent } from "../../agents/agent/agent.types";
import { createUserAgent } from "../../agents/built-in/user/user-agent";
import { ModelResolutionError, StrategyValidationError } from "../../errors/index";
import { createBroadcastFlow } from "../../flows/built-in/broadcast/broadcast-flow";
import { createCycleFlow } from "../../flows/built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../../flows/built-in/sequential/sequential-flow";
import { createPromptTemplate } from "../../prompts/template/prompt-template";
import type { ToolDefinition } from "../../tools/tool.types";
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
import type {
  LoadStrategyOptions,
  ParsedModel,
  ProviderFactory,
  ProviderResolver,
} from "./loader.types";

// Known Providers — maps providerID to npm package name

/**
 * Maps short provider identifiers to their AI SDK npm package names.
 * This is metadata only — core never imports these packages directly.
 * The daemon uses this map to know which package to `bun add` when needed.
 */
export const KNOWN_PROVIDERS: Readonly<Record<string, string>> = {
  openai: "@ai-sdk/openai",
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
  "google-vertex": "@ai-sdk/google-vertex",
  "github-copilot": "@ai-sdk/openai-compatible",
  ollama: "ollama-ai-provider",
  groq: "@ai-sdk/groq",
  mistral: "@ai-sdk/mistral",
  xai: "@ai-sdk/xai",
  bedrock: "@ai-sdk/amazon-bedrock",
  azure: "@ai-sdk/azure",
  cohere: "@ai-sdk/cohere",
  deepseek: "@ai-sdk/deepseek",
  fireworks: "@ai-sdk/fireworks",
  together: "@ai-sdk/togetherai",
} as const;

// parseModel()

/**
 * Parse a model string in the format `providerID/modelID`.
 *
 * The model ID may contain slashes (e.g., `"ollama/meta-llama/llama-3"`),
 * so only the first slash is used as the separator.
 *
 * @throws {ModelResolutionError} If the string is empty or has no slash separator.
 *
 * @example
 * ```ts
 * parseModel("openai/gpt-4o")
 * // => { providerID: "openai", modelID: "gpt-4o", packageName: "@ai-sdk/openai" }
 *
 * parseModel("ollama/meta-llama/llama-3")
 * // => { providerID: "ollama", modelID: "meta-llama/llama-3", packageName: "ollama-ai-provider" }
 * ```
 */
export function parseModel(modelString: string): ParsedModel {
  if (!modelString || modelString.trim().length === 0) {
    throw new ModelResolutionError(modelString, "Model string cannot be empty");
  }

  const trimmed = modelString.trim();
  const slashIndex = trimmed.indexOf("/");

  if (slashIndex === -1) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": expected format "providerID/modelID" (e.g., "openai/gpt-4o")`,
    );
  }

  if (slashIndex === 0) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": provider ID cannot be empty`,
    );
  }

  const providerID = trimmed.slice(0, slashIndex);
  const modelID = trimmed.slice(slashIndex + 1);

  if (modelID.length === 0) {
    throw new ModelResolutionError(
      trimmed,
      `Invalid model string "${trimmed}": model ID cannot be empty`,
    );
  }

  return {
    providerID,
    modelID,
    packageName: KNOWN_PROVIDERS[providerID],
  };
}

/** Check if a provider ID is in the known providers map. */
export function isKnownProvider(providerID: string): boolean {
  return providerID in KNOWN_PROVIDERS;
}

/**
 * Get the npm package name for a known provider.
 * Returns undefined for unknown providers.
 */
export function getProviderPackage(providerID: string): string | undefined {
  return KNOWN_PROVIDERS[providerID];
}

// extractProviderIds()

/**
 * Extract unique provider IDs from a raw (already-parsed) strategy object.
 *
 * Scans `defaults.model` and each agent's `model` field for
 * "providerID/modelID" strings. Returns the set of unique provider IDs.
 *
 * Works on pre-validation data — silently skips invalid model strings.
 * This allows callers to discover required providers before the full
 * Zod validation pass.
 *
 * @example
 * ```ts
 * const raw = JSON.parse(strategyJson);
 * const providerIds = extractProviderIds(raw);
 * // => Set { "openai", "anthropic" }
 * ```
 */
export function extractProviderIds(raw: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();

  // Helper: extract providerID from a "providerID/modelID" string
  const extract = (model: unknown): void => {
    if (typeof model !== "string") return;
    try {
      ids.add(parseModel(model).providerID);
    } catch {
      // Skip invalid model strings silently
    }
  };

  // Check defaults.model
  const defaults = raw.defaults as Record<string, unknown> | undefined;
  if (defaults) {
    extract(defaults.model);
  }

  // Check agents[*].model
  const agents = raw.agents as Record<string, Record<string, unknown>> | undefined;
  if (agents) {
    for (const agentDefinition of Object.values(agents)) {
      extract(agentDefinition.model);
    }
  }

  return ids;
}

// Agent instantiation

/**
 * Build all agents defined in the strategy into live Agent instances.
 *
 * When `credentialStore` + `providerResolver` are provided in options,
 * model resolution may involve async credential lookups. When only
 * explicit `providers` are given, the async overhead is minimal.
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
      registry[name] = await buildLLMAgent(name, agentDefinition, strategy.defaults, options);
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
    abort: options.abort,
  });
}

/**
 * Instantiate an LLM agent from its definition, resolving the model
 * via the provider map and tools via the built-in/custom tool registries.
 */
async function buildLLMAgent(
  name: string,
  agentDefinition: LLMAgentDef,
  defaults: StrategyDefaults | undefined,
  options: LoadStrategyOptions,
): Promise<Agent> {
  // Resolve effective values (useDefaults fills gaps)
  const useDefaults = agentDefinition.useDefaults === true && defaults !== undefined;

  // modelOverride replaces whatever the strategy file specifies
  const effectiveModel =
    options.modelOverride ?? agentDefinition.model ?? (useDefaults ? defaults?.model : undefined);
  const effectiveTools = agentDefinition.tools ?? (useDefaults ? defaults?.tools : undefined);
  const effectiveSystemPrompt =
    agentDefinition.systemPrompt ?? (useDefaults ? defaults?.systemPrompt : undefined);

  // Model is required for LLM agents
  if (!effectiveModel) {
    throw new StrategyValidationError(
      `Agent "${name}" has no model and useDefaults is ${agentDefinition.useDefaults ?? false}. ` +
        "Either set a model on the agent or enable useDefaults with a defaults.model defined.",
    );
  }

  // Resolve model via provider map or credential-based resolution
  const model = await resolveModel(effectiveModel, name, options);

  // Resolve tools
  const tools = effectiveTools
    ? resolveTools(effectiveTools, name, options.customTools)
    : undefined;

  // Build system prompt template if defined
  const systemPromptTemplate = agentDefinition.systemPromptTemplate
    ? createPromptTemplate({
        template: agentDefinition.systemPromptTemplate.template,
        variables: agentDefinition.systemPromptTemplate.variables,
      })
    : undefined;

  return createAgent({
    name,
    model,
    systemPrompt: systemPromptTemplate ? undefined : effectiveSystemPrompt,
    systemPromptTemplate,
    tools,
    temperature: agentDefinition.temperature,
    topProbability: agentDefinition.topProbability,
    maxSteps: agentDefinition.maxSteps,
    hooks: options.agentHooks,
    abort: options.abort,
  });
}

// Model resolution

/**
 * Parse a "providerID/modelID" string and create a LanguageModel.
 *
 * Resolution order:
 * 1. Explicit `providers` map (if the provider ID has an entry).
 * 2. Credential-based resolution via `credentialStore` + `providerResolver`.
 * 3. Error — no factory available for this provider.
 */
async function resolveModel(
  modelString: string,
  agentName: string,
  options: LoadStrategyOptions,
): Promise<import("ai").LanguageModel> {
  let providerID: string;
  let modelID: string;

  try {
    const parsed = parseModel(modelString);
    providerID = parsed.providerID;
    modelID = parsed.modelID;
  } catch (error) {
    // Re-throw as StrategyValidationError with agent context
    const detail =
      error instanceof ModelResolutionError
        ? error.message
        : `Invalid model string "${modelString}"`;
    throw new StrategyValidationError(
      `Agent "${agentName}" has invalid model string "${modelString}". ${detail}`,
    );
  }

  // 1. Check explicit providers map
  const explicitFactory = options.providers?.[providerID];
  if (explicitFactory) {
    return explicitFactory(modelID);
  }

  // 2. Try credential-based resolution
  if (options.credentialStore && options.providerResolver) {
    const factory = await resolveModelViaCredentials(
      providerID,
      agentName,
      options.credentialStore,
      options.providerResolver,
    );
    if (factory) {
      return factory(modelID);
    }
  }

  // 3. No factory available
  const availableProviders = options.providers ? Object.keys(options.providers) : [];
  const credentialHint = options.credentialStore
    ? " Credential store was checked but no credential was found."
    : "";
  throw new StrategyValidationError(
    `Agent "${agentName}" uses provider "${providerID}" but no factory was provided for it. ` +
      `Available providers: [${availableProviders.join(", ")}].${credentialHint}`,
  );
}

/**
 * Attempt to resolve a ProviderFactory via the credential store + resolver.
 * Returns undefined if no credential is found for the provider.
 */
async function resolveModelViaCredentials(
  providerID: string,
  agentName: string,
  credentialStore: import("../../credentials/credentials.types").CredentialStore,
  providerResolver: ProviderResolver,
): Promise<ProviderFactory | undefined> {
  const credential = await credentialStore.resolve(providerID);
  if (!credential) {
    return undefined;
  }

  try {
    return await providerResolver(providerID, credential);
  } catch (resolverError) {
    const detail = resolverError instanceof Error ? resolverError.message : String(resolverError);
    throw new StrategyValidationError(
      `Agent "${agentName}": providerResolver failed for "${providerID}": ${detail}`,
      { cause: resolverError },
    );
  }
}

// Tool resolution

/**
 * Resolve an array of tool name strings into a Record<string, ToolDef>.
 * Checks built-in tools first, then custom tools.
 */
function resolveTools(
  toolNames: readonly string[],
  agentName: string,
  customTools?: Readonly<Record<string, ToolDefinition>>,
): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {};

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
