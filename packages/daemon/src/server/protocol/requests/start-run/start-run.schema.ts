import { z } from "zod";
import { ClientBase } from "../../shared";

export const StartRunMessage = ClientBase.extend({
  type: z.literal("start_run"),
  runId: z.string().min(1),
  input: z.string().optional(),
});

export type StartRunMessage = z.infer<typeof StartRunMessage>;
