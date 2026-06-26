import { z } from "zod";

/** A literal value or an explicit reference to a process environment variable. */
export const McpValueSchema = z.union([
  z.string(),
  z.object({ env: z.string().min(1) }).strict(),
]);

const McpServerBaseFields = {
  enabledByDefault: z.boolean().optional(),
};

export const McpHttpServerDefinitionSchema = z
  .object({
    ...McpServerBaseFields,
    transport: z.enum(["http", "sse"]),
    url: McpValueSchema,
    headers: z.record(McpValueSchema).optional(),
  })
  .strict();

export const McpStdioServerDefinitionSchema = z
  .object({
    ...McpServerBaseFields,
    transport: z.literal("stdio"),
    command: McpValueSchema,
    args: z.array(McpValueSchema).optional(),
    cwd: McpValueSchema.optional(),
    env: z.record(McpValueSchema).optional(),
  })
  .strict();

/** Strict MCP server definition accepted by shared and strategy configuration. */
export const McpServerDefinitionSchema = z.discriminatedUnion("transport", [
  McpHttpServerDefinitionSchema,
  McpStdioServerDefinitionSchema,
]);

/** Strict file format for `~/.comma/mcp.json` and `<cwd>/.comma/mcp.json`. */
export const McpConfigFileSchema = z
  .object({
    mcpServers: z.record(McpServerDefinitionSchema).default({}),
  })
  .strict();
