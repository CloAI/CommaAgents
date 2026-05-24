import { defineTool, registerTool, ToolContext, ToolResult } from "@comma-agents/core";
import { z } from 'zod';

const get_node = defineTool({
  description: "",
  parameters: z.object({
    
  }),
  execute: function (validatedArguments: any, toolContext: ToolContext): Promise<ToolResult<unknown>> {
    throw new Error("Function not implemented.");
  }
});

registerTool("get_node", );