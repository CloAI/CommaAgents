import { z } from "zod/v4";

/** Model identifiers keyed by role name, without the `@` prefix. */
export const ModelRolesSchema = z.record(z.string().min(1), z.string().min(1));

export const GetModelRolesArgumentsSchema = z.object({}).strict();

export const SetModelRolesArgumentsSchema = z
  .object({ modelRoles: ModelRolesSchema })
  .strict();

export const ModelRolesOutputSchema = z
  .object({
    modelRoles: ModelRolesSchema,
    /** Roles offered for configuration even when no model is set yet. */
    defaults: z.array(
      z.object({ name: z.string(), description: z.string() }).strict(),
    ),
  })
  .strict();
