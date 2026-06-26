import { z } from "zod";

import { ClientBase } from "../../shared";

export const ListMcpServersMessage = ClientBase.extend({
  type: z.literal("list_mcp_servers"),
  cwd: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  strategyPath: z.string().min(1).optional(),
});

export type ListMcpServersMessage = z.infer<typeof ListMcpServersMessage>;
