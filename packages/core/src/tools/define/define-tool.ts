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
  readonly execute: (
    validatedArguments: z.infer<ParameterSchema>,
    toolContext: ToolContext,
  ) => Promise<ToolResult<DataShape>>;
}): ToolDefinition<ParameterSchema, DataShape> {
  return {
    description: config.description,
    parameters: config.parameters,
    ...(config.policies ? { policies: config.policies } : {}),
    execute: config.execute,
  };
}
