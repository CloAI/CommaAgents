import { z } from "zod/v4";

/** A refresh covers every provider, so it takes no arguments. */
export const RefreshProvidersArgumentsSchema = z.object({}).strict();
/** The refreshed list arrives on `core.providers.list`. */
export const RefreshProvidersOutputSchema = z.object({}).strict();
