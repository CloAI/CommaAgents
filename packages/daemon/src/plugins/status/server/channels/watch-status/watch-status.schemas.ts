import { z } from "zod";
import { DaemonStatusSchema } from "../../commands/get-status/get-status.schemas";
export const WatchStatusArgumentsSchema = z.object({}).strict();
export const WatchStatusMessageSchema = z
  .object({ type: z.literal("status_updated"), status: DaemonStatusSchema })
  .strict();
