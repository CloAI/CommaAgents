import { z } from "zod";
import { ClientBase } from "../../shared";

export const StopRunMessage = ClientBase.extend({
  type: z.literal("stop_run"),
  runId: z.string().min(1),
});

export type StopRunMessage = z.infer<typeof StopRunMessage>;
