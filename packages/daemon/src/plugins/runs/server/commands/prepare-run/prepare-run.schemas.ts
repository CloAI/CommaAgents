import { z } from "zod/v4";
import {
  NewRunConfigurationSchema,
  RunConfigurationOverridesSchema,
} from "../../../preparation/preparation.schemas";
export const PrepareNewRunArgumentsSchema = z
  .object({
    runId: z.string().min(1).optional(),
    configuration: NewRunConfigurationSchema,
  })
  .strict();
export const PrepareExistingRunArgumentsSchema = z
  .object({
    runId: z.string().min(1),
    configuration: RunConfigurationOverridesSchema.optional(),
  })
  .strict();
export const PrepareRunArgumentsSchema = z.union([
  PrepareExistingRunArgumentsSchema,
  PrepareNewRunArgumentsSchema,
]);
export const PrepareRunOutputSchema = z.object({ runId: z.string() }).strict();
