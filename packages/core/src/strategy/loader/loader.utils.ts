import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
import { getModelFamily, resolveModelReference } from "../../model/roles";
import { buildContextBlocks } from "../../prompts/context-blocks";
import type { PromptTemplate } from "../../prompts/prompts.types";
import { createPromptTemplate } from "../../prompts/template/prompt-template";
import { buildSkillsPromptHeader } from "../../skills/skills.loader";
import type { SkillRegistry } from "../../skills/skills.types";
import {
  buildToolSystemPrompt,
  mergeSystemPrompts,
} from "../../tools/build-tool-system-prompt";
import { resolveTools } from "../../tools/tool.registry";
import type { ToolContext } from "../../tools/tool.types";
import type { AgentDef, LLMAgentDef, Strategy, UserAgentDef } from "../schema";
import type { SubagentTarget } from "../../tools/built-in/delegate/delegate.types";
import {
  discoverStrategies,
  resolveInstalledStrategyReference,
} from "../discover/discover";
import { parseStrategyHeader } from "../discover/discover.utils";
import {
  CONTEXT_BLOCKS_VARIABLE,
  MODEL_FAMILY_VARIABLE,
  SKILL_TOOL_NAMES,
  STRATEGY_FILE_PATTERN,
} from "./loader.constants";
import type { LoadStrategyOptions } from "./loader.types";

// Agent instantiation

type BuiltInAgentFactory = (
  name: string,
  agentDefinition: AgentDef,
  options: LoadStrategyOptions,
  strategy: Strategy,
) => Agent | Promise<Agent>;

const builtInAgentFactories: Readonly<Record<string, BuiltInAgentFactory>> = {
  user(name, agentDefinition, options) {
    return buildUserAgent(name, agentDefinition as UserAgentDef, options);
  },
  llm(name, agentDefinition, options, strategy) {
    return buildLLMAgent(
      name,
      agentDefinition as LLMAgentDef,
      options,
      strategy,
    );
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
      registry[name] = await builtInFactory(
        name,
        agentDefinition,
        options,
        strategy,
      );
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
  strategy: Strategy,
): Promise<Agent> {
  const effectiveModel =
    agentDefinition.model === undefined
      ? undefined
      : resolveModelReference(agentDefinition.model, {
          configured: options.modelRoles,
          defaults: strategy.modelRoles,
        });

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
    agentDefinition.tools?.some((toolName) =>
      SKILL_TOOL_NAMES.includes(toolName),
    ) ?? false,
  );
  const { instructions, environment, ...conversationContext } =
    agentDefinition.context ?? {};
  const contextBlocks =
    instructions || environment
      ? await buildContextBlocks({
          cwd: options.cwd ?? options.sandbox?.cwd ?? process.cwd(),
          instructions,
          environment,
          instructionFiles: options.instructionFiles,
        })
      : "";

  const subagents = agentDefinition.subagents
    ? await resolveSubagents(name, agentDefinition.subagents, options)
    : undefined;

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
      ...(subagents ? { subagents } : {}),
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
    if (!existsSync(resolvedPath)) {
      throw new StrategyValidationError(
        `System prompt file not found: ${resolvedPath}`,
      );
    }
    resolvedSystemPrompt = await readFile(resolvedPath, "utf8");
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
    if (!existsSync(resolvedPath)) {
      throw new StrategyValidationError(
        `System prompt template file not found: ${resolvedPath}`,
      );
    }
    resolvedTemplate = await readFile(resolvedPath, "utf8");
  }

  // Prompt order: base, run-time context blocks, skills, tool contributions.
  let systemPrompt: string | PromptTemplate | undefined;
  if (agentDefinition.systemPromptTemplate) {
    // Context blocks hold repository files, so they enter as a variable: Liquid never parses their contents.
    const template = mergeSystemPrompts([
      resolvedTemplate ?? agentDefinition.systemPromptTemplate.template,
      contextBlocks ? `{{ ${CONTEXT_BLOCKS_VARIABLE} }}` : undefined,
      skillsPrompt,
      toolSystemPrompt,
    ]);
    systemPrompt = createPromptTemplate({
      template: template ?? "",
      variables: {
        [MODEL_FAMILY_VARIABLE]: getModelFamily(effectiveModel),
        ...agentDefinition.systemPromptTemplate.variables,
        ...(contextBlocks ? { [CONTEXT_BLOCKS_VARIABLE]: contextBlocks } : {}),
      },
    });
  } else {
    systemPrompt = mergeSystemPrompts([
      resolvedSystemPrompt,
      contextBlocks,
      skillsPrompt,
      toolSystemPrompt,
    ]);
  }

  // Pass string model and tool names directly — createAgent resolves internally
  return createAgent(
    {
      name,
      model: effectiveModel,
      privacy: agentDefinition.privacy,
      systemPrompt,
      tools: agentDefinition.tools,
      maxSteps: agentDefinition.maxSteps,
      ...(agentDefinition.providerOptions
        ? { providerOptions: agentDefinition.providerOptions }
        : {}),
      ...(agentDefinition.modelOptions
        ? { modelOptions: agentDefinition.modelOptions }
        : {}),
      ...(agentDefinition.outputSchema
        ? { outputSchema: jsonSchema(agentDefinition.outputSchema) }
        : {}),
      ...(agentDefinition.context
        ? {
            context:
              typeof conversationContext.compaction === "object" &&
              conversationContext.compaction.model !== undefined
                ? {
                    ...conversationContext,
                    compaction: {
                      ...conversationContext.compaction,
                      model: resolveModelReference(
                        conversationContext.compaction.model,
                        {
                          configured: options.modelRoles,
                          defaults: strategy.modelRoles,
                        },
                      ),
                    },
                  }
                : conversationContext,
          }
        : {}),
    },
    {
      sandbox: options.sandbox,
      privacyRuntime: options.privacyRuntime,
      skillRegistry: options.skillRegistry,
      inputCollector: options.inputCollector,
      launchStrategy: options.launchStrategy,
      requestStrategySwitch: options.requestStrategySwitch,
      languageService: options.languageService,
      questionRequester: options.questionRequester,
      runId: options.runId,
      mcpTools: options.mcpToolsByAgent?.[name]?.tools,
      subagents,
    },
  );
}

/**
 * Resolve an agent's `subagents` map to launchable strategy files.
 * File references are relative to the strategy directory; other values are discoverable strategy names.
 * @param {string} agentName - Agent declaring the subagents, for error messages.
 * @param {Readonly<Record<string, string>>} references - Subagent names mapped to paths or strategy names.
 * @param {LoadStrategyOptions} options - Loader options supplying the strategy directory and cwd.
 * @returns {Promise<SubagentTarget[]>} Launchable targets.
 */
export async function resolveSubagents(
  agentName: string,
  references: Readonly<Record<string, string>>,
  options: LoadStrategyOptions,
): Promise<SubagentTarget[]> {
  const targets: SubagentTarget[] = [];
  let discovered: Awaited<ReturnType<typeof discoverStrategies>> | undefined;
  for (const [subagentName, reference] of Object.entries(references)) {
    if (STRATEGY_FILE_PATTERN.test(reference)) {
      const strategyPath = resolve(
        options.strategyDir ?? process.cwd(),
        reference,
      );
      const header = await parseStrategyHeader(strategyPath);
      if (!header.ok) {
        throw new StrategyValidationError(
          `Agent "${agentName}" subagent "${subagentName}" cannot load ${strategyPath}: ${header.reason}`,
        );
      }
      targets.push({
        name: subagentName,
        description: header.description,
        strategyPath,
      });
      continue;
    }
    discovered ??= await discoverStrategies({ cwd: options.cwd });
    const match =
      discovered.strategies.find((strategy) => strategy.name === reference) ??
      (await resolveInstalledStrategyReference(reference));
    if (!match) {
      throw new StrategyValidationError(
        `Agent "${agentName}" subagent "${subagentName}" references unknown strategy "${reference}".`,
      );
    }
    targets.push({
      name: subagentName,
      description: match.description,
      strategyPath: match.path,
      ...(match.manifestPath ? { manifestPath: match.manifestPath } : {}),
    });
  }
  return targets;
}

function buildAgentSkillsPrompt(
  agentName: string,
  requiredSkillNames: readonly string[] | undefined,
  registry: SkillRegistry | undefined,
  canLoadSkills: boolean,
): string {
  if (!registry) {
    if (requiredSkillNames && requiredSkillNames.length > 0) {
      throw new StrategyValidationError(
        `Agent "${agentName}" requires skills, but no skill registry is configured.`,
      );
    }
    return "";
  }

  // Listing skills an agent cannot load only invites calls to tools it does not have.
  const availableSkills = canLoadSkills
    ? buildSkillsPromptHeader(registry)
    : "";
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

/** @internal Used by tests to assert the header gets attached. */
export function previewSkillsHeader(registry: SkillRegistry): string {
  return buildSkillsPromptHeader(registry);
}
