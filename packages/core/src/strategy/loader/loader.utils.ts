import { isAbsolute, resolve } from "node:path";

import { jsonSchema } from "ai";
import { createAgent } from "../../agents/agent/agent";
import type { Agent } from "../../agents/agent/agent.types";
import { createUserAgent } from "../../agents/built-in/user/user-agent";
import {
  getRegisteredAgentNames,
  resolveRegisteredAgent,
} from "../../agents/registry/agent-registry";
import { BUILT_IN_AGENT_NAMES } from "../../agents/registry/agent-registry.constants";
import { StrategyValidationError } from "../../errors/index";
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
import type { ToolContext } from "../../tools/tool.types";
import type { AgentDef, LLMAgentDef, Strategy, UserAgentDef } from "../schema";
import type { LoadStrategyOptions } from "./loader.types";

// Agent instantiation

type BuiltInAgentFactory = (
  name: string,
  agentDefinition: AgentDef,
  options: LoadStrategyOptions,
) => Agent | Promise<Agent>;

const builtInAgentFactories: Readonly<Record<string, BuiltInAgentFactory>> = {
  user(name, agentDefinition, options) {
    return buildUserAgent(name, agentDefinition as UserAgentDef, options);
  },
  llm(name, agentDefinition, options) {
    return buildLLMAgent(name, agentDefinition as LLMAgentDef, options);
  },
};

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
    const agentType = agentDefinition.type ?? "llm";
    const builtInFactory = builtInAgentFactories[agentType];
    if (builtInFactory) {
      registry[name] = await builtInFactory(name, agentDefinition, options);
      continue;
    }

    const registeredAgent = resolveRegisteredAgent(agentType);
    if (!registeredAgent) {
      throw new StrategyValidationError(
        `Agent "${name}" references unknown agent type "${agentType}". ` +
          `Built-in agents: [${BUILT_IN_AGENT_NAMES.join(", ")}]. ` +
          `Registered agents: [${getRegisteredAgentNames().join(", ") || "(none)"}].`,
      );
    }

    registry[name] = await registeredAgent.create({
      name,
      config: "config" in agentDefinition ? (agentDefinition.config ?? {}) : {},
      runtime: options,
    });
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
  const skillsPrompt = buildAgentSkillsPrompt(
    name,
    agentDefinition.skills,
    options.skillRegistry,
  );

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
  let templatePrompt: string | undefined;
  if (agentDefinition.systemPromptTemplate) {
    templatePrompt = prependSkillsHeader(
      resolvedTemplate ?? agentDefinition.systemPromptTemplate.template,
      skillsPrompt,
    );
    basePrompt = createPromptTemplate({
      template: templatePrompt,
      variables: agentDefinition.systemPromptTemplate.variables,
    });
  } else {
    basePrompt = prependSkillsHeader(resolvedSystemPrompt, skillsPrompt);
  }

  // Merge: base prompt + tool contributions
  let systemPrompt: string | PromptTemplate | undefined;
  if (toolSystemPrompt && basePrompt) {
    if (typeof basePrompt === "string") {
      // Both are strings - merge directly
      systemPrompt = mergeSystemPrompts([basePrompt, toolSystemPrompt]);
    } else {
      // basePrompt is a PromptTemplate - append tool prompt to template
      systemPrompt = createPromptTemplate({
        template: `${templatePrompt}\n\n${toolSystemPrompt}`,
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
    ...(agentDefinition.outputSchema
      ? { outputSchema: jsonSchema(agentDefinition.outputSchema) }
      : {}),
    ...(agentDefinition.context ? { context: agentDefinition.context } : {}),
    ...(options.skillRegistry ? { skillRegistry: options.skillRegistry } : {}),
    ...(options.inputCollector
      ? { inputCollector: options.inputCollector }
      : {}),
    ...(options.launchStrategy
      ? { launchStrategy: options.launchStrategy }
      : {}),
    ...(options.languageService
      ? { languageService: options.languageService }
      : {}),
    ...(options.runId ? { runId: options.runId } : {}),
  });
}

function buildAgentSkillsPrompt(
  agentName: string,
  requiredSkillNames: readonly string[] | undefined,
  registry: SkillRegistry | undefined,
): string {
  if (!registry) {
    if (requiredSkillNames && requiredSkillNames.length > 0) {
      throw new StrategyValidationError(
        `Agent "${agentName}" requires skills, but no skill registry is configured.`,
      );
    }
    return "";
  }

  const availableSkills = buildSkillsPromptHeader(registry);
  if (!requiredSkillNames || requiredSkillNames.length === 0) {
    return availableSkills;
  }

  const requiredSkills = requiredSkillNames.map((skillName) => {
    const skill = registry.get(skillName);
    if (!skill) {
      throw new StrategyValidationError(
        `Agent "${agentName}" requires unknown skill "${skillName}". Available skills: ${
          registry
            .list()
            .map((entry) => entry.name)
            .join(", ") || "(none)"
        }.`,
      );
    }
    return skill;
  });

  const requiredSkillsPrompt = [
    "## Required Skills",
    "The following mandatory skill instructions are already loaded. Follow them for this agent's work:",
    ...requiredSkills.map(
      (skill) => `### ${skill.name}\n${skill.content.trim()}`,
    ),
  ].join("\n\n");

  return availableSkills
    ? `${availableSkills}\n\n${requiredSkillsPrompt}`
    : requiredSkillsPrompt;
}

/**
 * Concatenate the skills header onto a static system prompt. Used by
 * `buildLLMAgent` so callers don't have to remember to inject skills into
 * every prompt themselves.
 */
function prependSkillsHeader(
  systemPrompt: string,
  skillsHeader: string,
): string;
function prependSkillsHeader(
  systemPrompt: string | undefined,
  skillsHeader: string,
): string | undefined;
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
