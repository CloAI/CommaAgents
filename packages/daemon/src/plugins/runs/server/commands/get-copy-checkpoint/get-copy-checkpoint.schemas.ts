import { z } from "zod/v4";
export { RunArgumentsSchema as GetCopyCheckpointArgumentsSchema } from "../../server.schemas";

export const GetCopyCheckpointOutputSchema = z
  .object({
    checkpoint: z
      .object({
        checkpointId: z.string().min(1),
        completedAt: z.iso.datetime(),
        runIds: z.array(z.string().min(1)),
      })
      .strict()
      .nullable(),
  })
  .strict();
