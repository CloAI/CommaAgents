import { z } from "zod/v4";
export const ListActiveRunsArgumentsSchema = z.object({}).strict();
export const ListActiveRunsOutputSchema = z
  .object({
    runs: z.array(
      z
        .object({
          runId: z.string().min(1),
          parentRunId: z.string().min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();
