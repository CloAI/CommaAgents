import { z } from "zod/v4";
import { DaemonStatusSchema } from "../../commands/get-status/get-status.schemas";
export const WatchStatusArgumentsSchema = z.object({}).strict();
export const WatchStatusMessageSchema = z
  .object({ type: z.literal("status.updated"), data: DaemonStatusSchema })
  .strict();
