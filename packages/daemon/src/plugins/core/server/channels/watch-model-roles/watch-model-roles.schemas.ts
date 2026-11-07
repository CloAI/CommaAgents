import { z } from "zod/v4";
import { ModelRolesOutputSchema } from "../../commands/model-roles/model-roles.schemas";

/** The model roles take no arguments. */
export const WatchModelRolesArgumentsSchema = z.object({}).strict();
/** The configured roles and offered defaults, sent when the channel opens and after every change. */
export const WatchModelRolesMessageSchema = z
  .object({
    type: z.literal("modelRoles.updated"),
    data: ModelRolesOutputSchema,
  })
  .strict();
