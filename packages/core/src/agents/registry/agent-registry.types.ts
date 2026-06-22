import type { z } from "zod";

import type { LanguageService } from "../../language";
import type { SkillRegistry } from "../../skills/skills.types";
import type { LaunchStrategyHandle } from "../../tools/launch-strategy.types";
import type { Agent } from "../agent/agent.types";
import type { InputCollector } from "../built-in/user/user-agent.types";

/** Loader-provided services available when constructing a registered agent type. */
export interface AgentTypeRuntime {
  /**
   * Input collector used by interactive agents and tools.
   * Required when a factory creates a user agent that requests input.
   */
  readonly inputCollector?: InputCollector;
  /**
   * Model override supplied for the current load operation.
   * Custom factories decide whether and how to apply it.
   */
  readonly modelOverride?: string;
  /** Skill registry available to agents and skill-aware tools. */
  readonly skillRegistry?: SkillRegistry;
  /** Base directory for resolving paths referenced by the loaded definition. */
  readonly strategyDir?: string;
  /** Runtime handle for launching sub-strategies from tools or custom agents. */
  readonly launchStrategy?: LaunchStrategyHandle;
  /** Language service available to language-aware tools. */
  readonly languageService?: LanguageService;
  /**
   * Identifier for the current strategy invocation.
   * Factories can pass it to agents and tools that isolate state by run.
   */
  readonly runId?: string;
}

/** Context passed to a registered custom agent factory. */
export interface AgentTypeContext<Config> {
  /** Name declared for this agent instance. */
  readonly name: string;
  /** Custom configuration validated by the agent type's schema. */
  readonly config: Config;
  /** Loader-provided services for the current invocation. */
  readonly runtime: AgentTypeRuntime;
}

/** Definition used to validate and construct a reusable declarative agent type. */
export interface AgentTypeDefinition<ConfigSchema extends z.ZodTypeAny> {
  /** Schema for the agent definition's `config` object. */
  readonly configSchema: ConfigSchema;
  /** Create a runnable agent from validated configuration and runtime services. */
  readonly create: (
    context: AgentTypeContext<z.output<ConfigSchema>>,
  ) => Agent | Promise<Agent>;
}

/** @internal Invalidated context used by declarative agent loaders. */
export interface RegisteredAgentContext {
  readonly name: string;
  readonly config: unknown;
  readonly runtime: AgentTypeRuntime;
}

/** @internal Type-erased registered factory used after registration. */
export interface RegisteredAgentFactory {
  readonly create: (context: RegisteredAgentContext) => Promise<Agent>;
}
