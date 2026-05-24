import type { z } from "zod";
import type { Policy } from "../../guard/guard.types";
import type { ToolContext, ToolDefinition, ToolResult } from "../tool.types";

export function defineTool<
  ParameterSchema extends z.ZodType,
  DataShape = unknown,
>(config: {
  readonly description: string;
  readonly parameters: ParameterSchema;
  readonly policies?: readonly Policy[];
  /**
   * Optional system prompt contribution from this tool.
   * Injected ONCE into the agent's system prompt at creation time.
   * Can be a static string or a function receiving ToolContext.
   */
  readonly systemPrompt?:
    | string
    | ((toolContext: ToolContext) => Promise<string> | string);
  readonly execute: (
    validatedArguments: z.infer<ParameterSchema>,
    toolContext: ToolContext,
  ) => Promise<ToolResult<DataShape>>;
}): ToolDefinition<ParameterSchema, DataShape> {
  return {
    description: config.description,
    parameters: config.parameters,
    ...(config.policies ? { policies: config.policies } : {}),
    ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
    execute: config.execute,
  };
}
