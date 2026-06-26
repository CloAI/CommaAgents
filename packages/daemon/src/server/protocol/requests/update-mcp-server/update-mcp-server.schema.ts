import { z } from "zod";

import { ClientBase } from "../../shared";

export const UpdateMcpServerMessage = ClientBase.extend({
  type: z.literal("update_mcp_server"),
  serverId: z.string().min(1),
  enabled: z.boolean(),
  scope: z.enum(["default", "run"]),
  cwd: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  strategyPath: z.string().min(1).optional(),
});

export type UpdateMcpServerMessage = z.infer<typeof UpdateMcpServerMessage>;
