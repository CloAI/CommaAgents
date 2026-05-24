// Daemon → Client: available_models
// Response to a get_available_models request.

import { z } from "zod";
import { ModelInfoSchema } from "../../responses/provider-list/provider-list.schema";
import { DaemonBase } from "../../shared";

export const AvailableModelSchema = ModelInfoSchema.extend({
  hasCredentials: z.boolean(),
  providers: z.array(z.string()),
  configuredProviders: z.array(z.string()),
});

export type AvailableModelWire = z.infer<typeof AvailableModelSchema>;

export const AvailableModelsMessage = DaemonBase.extend({
  type: z.literal("available_models"),
  models: z.array(AvailableModelSchema),
});

export type AvailableModelsMessage = z.infer<typeof AvailableModelsMessage>;
