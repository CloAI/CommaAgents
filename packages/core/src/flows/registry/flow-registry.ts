import type { z } from "zod";

import { StrategyValidationError } from "../../errors";
import { BUILT_IN_FLOW_NAMES } from "./flow-registry.constants";
import type {
  FlowTypeDefinition,
  RegisteredFlowFactory,
} from "./flow-registry.types";

let flowRegistry = new Map<string, RegisteredFlowFactory>();

/**
 * Preserve schema inference when declaring a reusable custom flow type.
 *
 * @param definition - Configuration schema and factory for the custom flow.
 * @returns The unchanged flow definition, with inferred configuration types.
 * @example
 * ```ts
 * const firstMatchFlow = defineFlowType({
 *   configSchema: z.object({ marker: z.string() }),
 *   create: ({ name, steps, config }) => createFlow({
 *     name,
 *     steps,
 *     execute: async (availableSteps, message, flowContext) => {
 *       for (const step of availableSteps) {
 *         const result = await flowContext.runStep(step, message);
 *         if (result.text.includes(config.marker)) return result.text;
 *       }
 *       return message;
 *     },
 *   }),
 * });
 * ```
 */
export function defineFlowType<ConfigSchema extends z.ZodTypeAny>(
  definition: FlowTypeDefinition<ConfigSchema>,
): FlowTypeDefinition<ConfigSchema> {
  return definition;
}

/**
 * Register a custom flow type for use in strategy and standalone flow files.
 *
 * @param name - Value referenced by a declarative flow's `type` field.
 * @param definition - Configuration schema and factory for the custom flow.
 * @example
 * ```ts
 * registerFlow("first-match", firstMatchFlow);
 * ```
 */
export function registerFlow<ConfigSchema extends z.ZodTypeAny>(
  name: string,
  definition: FlowTypeDefinition<ConfigSchema>,
): void {
  if (
    BUILT_IN_FLOW_NAMES.includes(name as (typeof BUILT_IN_FLOW_NAMES)[number])
  ) {
    console.warn(
      `[comma-agents] registerFlow("${name}"): overriding built-in flow "${name}". ` +
        "The custom flow will be used instead of the default.",
    );
  } else if (flowRegistry.has(name)) {
    console.warn(
      `[comma-agents] registerFlow("${name}"): overriding previously registered flow "${name}".`,
    );
  }

  flowRegistry.set(name, {
    create(context) {
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
          `Flow "${context.name}" configuration validation failed for type "${name}":\n${issues}`,
          { cause: result.error },
        );
      }

      return definition.create({
        name: context.name,
        steps: context.steps,
        config: result.data,
        resolveAgent: context.resolveAgent,
      });
    },
  });
}

/** Remove a custom flow registration. Built-in flow types remain available. */
export function unregisterFlow(name: string): boolean {
  return flowRegistry.delete(name);
}

/** Return the currently registered custom flow type names. */
export function getRegisteredFlowNames(): readonly string[] {
  return [...flowRegistry.keys()];
}

/** @internal Resolve a custom flow factory by type name. */
export function resolveRegisteredFlow(
  name: string,
): RegisteredFlowFactory | undefined {
  return flowRegistry.get(name);
}

/** Reset custom flow registrations. Primarily intended for test isolation. */
export function resetFlowRegistry(): void {
  flowRegistry = new Map();
}
