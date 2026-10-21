import { z } from "zod/v4";
export const PrepareRunArgumentsSchema = z
  .object({
    runId: z.string().min(1).optional(),
    strategyPath: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    manifestPath: z.string().min(1).optional(),
    modelOverride: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.runId || value.strategyPath),
    "runId or strategyPath is required",
  );
export const PrepareRunOutputSchema = z.object({ runId: z.string() }).strict();
