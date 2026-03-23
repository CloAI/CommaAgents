// defineTool — helper to create ToolDef instances with type inference

import type { z } from "zod";
import type { ToolContext, ToolDef, ToolResult } from "../tool.types";

/**
 * Creates a typed ToolDef with full parameter inference from the Zod schema.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { defineTool } from "@comma-agents/core";
 *
 * const weatherTool = defineTool({
 *   description: "Get the current weather for a location",
 *   parameters: z.object({
 *     location: z.string().describe("City name"),
 *     unit: z.enum(["celsius", "fahrenheit"]).optional(),
 *   }),
 *   execute: async (args, _ctx) => ({
 *     output: `Weather in ${args.location}: 72°F, sunny`,
 *   }),
 * });
 * ```
 */
export function defineTool<TParams extends z.ZodType>(config: {
  readonly description: string;
  readonly parameters: TParams;
  readonly execute: (args: z.infer<TParams>, ctx: ToolContext) => Promise<ToolResult>;
}): ToolDef<TParams> {
  return {
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
  };
}
