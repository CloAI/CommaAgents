import { z } from "zod/v4";
export const RunConfigurationSchema = z
  .object({
    strategyPath: z.string().min(1),
    cwd: z.string().min(1),
    manifestPath: z.string().min(1).optional(),
    /** `provider/model` per role name for this run; these win over the daemon and strategy roles. */
    modelRoles: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .strict();
export const NewRunConfigurationSchema = RunConfigurationSchema.extend({
  cwd: z.string().min(1).optional(),
});
export const RunConfigurationOverridesSchema =
  NewRunConfigurationSchema.partial().extend({
    manifestPath: z.string().min(1).nullable().optional(),
    /** Merged over the run's saved roles; `null` clears them. */
    modelRoles: z.record(z.string().min(1), z.string().min(1)).nullable().optional(),
  });
