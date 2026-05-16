// Client → Daemon: get_available_models
// Request models that are usable given the current credential configuration.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const GetAvailableModelsMessage = ClientBase.extend({
  type: z.literal("get_available_models"),
  modelId: z.string().optional(),
  scope: z.string().optional(),
});

export type GetAvailableModelsMessage = z.infer<
  typeof GetAvailableModelsMessage
>;
