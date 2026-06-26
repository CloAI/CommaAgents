import { z } from "zod";

import { DaemonBase } from "../../shared";

export const McpServerStatusSchema = z.object({
  id: z.string(),
  source: z.enum(["global", "workspace", "strategy"]),
  transport: z.enum(["http", "sse", "stdio"]),
  enabled: z.boolean(),
  enabledByDefault: z.boolean(),
  connected: z.boolean().optional(),
  toolCount: z.number().int().nonnegative(),
  assignedAgents: z.array(z.string()),
  error: z.string().optional(),
});

export const McpServerListMessage = DaemonBase.extend({
  type: z.literal("mcp_server_list"),
  servers: z.array(McpServerStatusSchema),
});

export type McpServerStatusWire = z.infer<typeof McpServerStatusSchema>;
export type McpServerListMessage = z.infer<typeof McpServerListMessage>;
