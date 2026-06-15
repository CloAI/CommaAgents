import { z } from "zod";
import { ClientBase } from "../../shared";

export const PrepareRunMessage = ClientBase.extend({
  type: z.literal("prepare_run"),
  runId: z.string().min(1).optional(),
  strategyPath: z.string().min(1).optional(),
  modelOverride: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  manifestPath: z.string().min(1).optional(),
});

export type PrepareRunMessage = z.infer<typeof PrepareRunMessage>;
