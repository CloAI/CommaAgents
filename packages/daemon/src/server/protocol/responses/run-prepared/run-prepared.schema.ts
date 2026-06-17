import { z } from "zod";
import { DaemonBase } from "../../shared";
import { ConversationHistorySchema } from "../shared";

export const RunPreparedMessage = DaemonBase.extend({
  type: z.literal("run_prepared"),
  runId: z.string(),
  strategyName: z.string(),
  agents: z.array(z.string()),
  flowTree: z.record(z.unknown()),
  conversation: ConversationHistorySchema,
});

export type RunPreparedMessage = z.infer<typeof RunPreparedMessage>;
