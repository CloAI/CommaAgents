import { z } from "zod/v4";
import { ProviderInfoSchema } from "@comma-agents/core";

/** The provider list takes no arguments. */
export const ListProvidersArgumentsSchema = z.object({}).strict();
/** The full provider list, sent when the channel opens and after every change. */
export const ListProvidersMessageSchema = z
  .object({
    type: z.literal("providers.updated"),
    data: z
      .object({
        providers: z.array(ProviderInfoSchema).readonly(),
        refreshing: z.boolean(),
      })
      .strict(),
  })
  .strict();
