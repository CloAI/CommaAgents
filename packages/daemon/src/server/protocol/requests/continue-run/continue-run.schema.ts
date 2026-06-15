import { z } from "zod";
import { ClientBase } from "../../shared";

export const ContinueRunMessage = ClientBase.extend({
  type: z.literal("continue_run"),
  runId: z.string().min(1),
  input: z.string(),
});

export type ContinueRunMessage = z.infer<typeof ContinueRunMessage>;
