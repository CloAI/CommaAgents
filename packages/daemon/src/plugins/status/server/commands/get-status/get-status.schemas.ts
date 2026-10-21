import { z } from "zod/v4";
export const GetStatusArgumentsSchema = z.object({}).strict();
export const DaemonStatusSchema = z
  .object({
    phase: z.enum(["starting", "running", "stopping", "stopped"]),
    version: z.string(),
    startedAt: z.string().datetime(),
  })
  .strict();
