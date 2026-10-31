import { z } from "zod/v4";
export const RunConfigurationSchema = z
  .object({
    strategyPath: z.string().min(1),
    cwd: z.string().min(1),
    manifestPath: z.string().min(1).optional(),
    modelOverride: z.string().min(1).optional(),
    /** `provider/model` by agent name; an entry wins over `modelOverride` for that agent. */
    modelOverrides: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .strict();
export const NewRunConfigurationSchema = RunConfigurationSchema.extend({
  cwd: z.string().min(1).optional(),
});
export const RunConfigurationOverridesSchema =
  NewRunConfigurationSchema.partial().extend({
    manifestPath: z.string().min(1).nullable().optional(),
    modelOverride: z.string().min(1).nullable().optional(),
    modelOverrides: z
      .record(z.string().min(1), z.string().min(1))
      .nullable()
      .optional(),
  });
