import { z } from "zod/v4";
import { ProviderInfoSchema } from "@comma-agents/core";

/** Optional credential scope and explicit live discovery. */
export const ListProvidersArgumentsSchema = z
  .object({
    scope: z.string().optional(),
    live: z.boolean().default(false),
  })
  .strict();
/** Resolved catalog using the core-owned provider schema. */
export const ListProvidersOutputSchema = z
  .object({
    providers: z.array(ProviderInfoSchema).readonly(),
  })
  .strict();
