import type { z } from "zod";

import type { Agent, AgentRuntime } from "../agent/agent.types";

/** Loader-provided services available when constructing a registered agent type. */
export interface AgentTypeRuntime extends AgentRuntime {
  /** Base directory for resolving paths referenced by the loaded definition. */
  readonly strategyDir?: string;
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
