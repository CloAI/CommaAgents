import {
  defineTool,
  registerTool,
  type ToolContext,
  type ToolResult,
} from "@comma-agents/core";
import { z } from "zod";

const _get_node = defineTool({
  description: "",
  parameters: z.object({}),
  execute: (
    _validatedArguments: any,
    _toolContext: ToolContext,
  ): Promise<ToolResult<unknown>> => {
    throw new Error("Function not implemented.");
  },
});

registerTool("get_node");
