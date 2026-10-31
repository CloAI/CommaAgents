import { z } from "zod/v4";

/** Provider identity and optional credential scope for explicit model refresh. */
export const RefreshProvidersArgumentsSchema = z
  .object({
    providerId: z.string().min(1),
    scope: z.string().optional(),
  })
  .strict();
