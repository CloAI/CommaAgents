import type { z } from "zod";

import type { Agent } from "../../agents/agent/agent.types";

/** Context passed to a registered custom flow factory. */
export interface FlowTypeContext<Config> {
  /** Name declared for this flow instance. */
  readonly name: string;
  /** Agent and nested-flow steps declared for this flow instance. */
  readonly steps: ReadonlyArray<Agent>;
  /** Custom configuration validated by the flow type's schema. */
  readonly config: Config;
  /** Resolve another named agent from the strategy or standalone loader registry. */
  readonly resolveAgent: (name: string) => Agent;
}

/** Definition used to validate and construct a reusable declarative flow type. */
export interface FlowTypeDefinition<ConfigSchema extends z.ZodTypeAny> {
  /** Schema for the flow definition's `config` object. */
  readonly configSchema: ConfigSchema;
  /** Create a runnable flow from resolved steps and validated configuration. */
  readonly create: (context: FlowTypeContext<z.output<ConfigSchema>>) => Agent;
}

/** @internal Unvalidated context used by the declarative flow loader. */
export interface RegisteredFlowContext {
  readonly name: string;
  readonly steps: ReadonlyArray<Agent>;
  readonly config: unknown;
  readonly resolveAgent: (name: string) => Agent;
}

/** @internal Type-erased registered factory used after registration. */
export interface RegisteredFlowFactory {
  readonly create: (context: RegisteredFlowContext) => Agent;
}
