import type { z } from "zod";

import { StrategyValidationError } from "../../errors";
import { BUILT_IN_AGENT_NAMES } from "./agent-registry.constants";
import type {
  AgentTypeDefinition,
  RegisteredAgentFactory,
} from "./agent-registry.types";

let agentRegistry = new Map<string, RegisteredAgentFactory>();

/**
 * Preserve schema inference when declaring a reusable custom agent type.
 *
 * @param definition - Configuration schema and factory for the custom agent.
 * @returns The unchanged agent definition with inferred configuration types.
 * @example
 * ```ts
 * const echoAgent = defineAgentType({
 *   configSchema: z.object({ prefix: z.string() }),
 *   create: ({ name, config }) => createAgent({
 *     name,
 *     execute: async (message) => `${config.prefix}${message}`,
 *   }),
 * });
 * ```
 */
export function defineAgentType<ConfigSchema extends z.ZodTypeAny>(
  definition: AgentTypeDefinition<ConfigSchema>,
): AgentTypeDefinition<ConfigSchema> {
  return definition;
}

/**
 * Register a custom agent type for use in strategy and standalone agent files.
 *
 * @param name - Value referenced by a declarative agent's `type` field.
 * @param definition - Configuration schema and factory for the custom agent.
 * @example
 * ```ts
 * registerAgent("echo", echoAgent);
 * ```
 */
export function registerAgent<ConfigSchema extends z.ZodTypeAny>(
  name: string,
  definition: AgentTypeDefinition<ConfigSchema>,
): void {
  if (
    BUILT_IN_AGENT_NAMES.includes(name as (typeof BUILT_IN_AGENT_NAMES)[number])
  ) {
    throw new StrategyValidationError(
      `Cannot register reserved built-in agent type "${name}". ` +
        `Choose a custom name other than: [${BUILT_IN_AGENT_NAMES.join(", ")}].`,
    );
  }

  if (name.length === 0) {
    throw new StrategyValidationError(
      "Custom agent type names cannot be empty.",
    );
  }

  if (agentRegistry.has(name)) {
    console.warn(
      `[comma-agents] registerAgent("${name}"): overriding previously registered agent "${name}".`,
    );
  }

  agentRegistry.set(name, {
    async create(context) {
      const result = definition.configSchema.safeParse(context.config);
      if (!result.success) {
        const issues = result.error.issues
          .map((issue) => {
            const path = issue.path.length
              ? `config.${issue.path.join(".")}`
              : "config";
            return `  - ${path}: ${issue.message}`;
          })
          .join("\n");
        throw new StrategyValidationError(
          `Agent "${context.name}" configuration validation failed for type "${name}":\n${issues}`,
          { cause: result.error },
        );
      }

      return await definition.create({
        name: context.name,
        config: result.data,
        runtime: context.runtime,
      });
    },
  });
}

/** Remove a custom agent registration. Built-in agent types remain available. */
export function unregisterAgent(name: string): boolean {
  return agentRegistry.delete(name);
}

/** Return the currently registered custom agent type names. */
export function getRegisteredAgentNames(): readonly string[] {
  return [...agentRegistry.keys()];
}

/** @internal Resolve a custom agent factory by type name. */
export function resolveRegisteredAgent(
  name: string,
): RegisteredAgentFactory | undefined {
  return agentRegistry.get(name);
}

/** Reset custom agent registrations. Primarily intended for test isolation. */
export function resetAgentRegistry(): void {
  agentRegistry = new Map();
}
