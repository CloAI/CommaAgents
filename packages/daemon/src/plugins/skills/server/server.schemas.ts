import { z } from "zod/v4";
import {
  SkillSchema,
  SkillSummarySchema,
  SkillLoadWarningSchema,
  SkillSearchArgumentsSchema,
  SkillSearchOutputSchema,
} from "@comma-agents/core/skills";

/** Explicit workspace discovery request; cwd defaults in the plugin. */
export const SkillsListArgumentsSchema = z
  .object({ cwd: z.string().min(1).optional() })
  .strict();
/** Metadata and discovery diagnostics from one scan. */
export const SkillsListOutputSchema = z
  .object({
    skills: z.array(SkillSummarySchema).readonly(),
    warnings: z.array(SkillLoadWarningSchema).readonly(),
  })
  .strict();
/** Exact resolved skill lookup within the workspace's discovery roots. */
export const SkillsGetArgumentsSchema = SkillsListArgumentsSchema.extend({
  name: z.string().min(1),
});
/** Full instructions and diagnostics; the browser may inspect without a run. */
export const SkillsGetOutputSchema = z
  .object({
    skill: SkillSchema,
    warnings: z.array(SkillLoadWarningSchema).readonly(),
  })
  .strict();
/** Shared core search inputs with the workspace selector. */
export const SkillsSearchArgumentsSchema = SkillSearchArgumentsSchema.extend({
  cwd: z.string().min(1).optional(),
});
/** Shared ranked results and discovery diagnostics. */
export const SkillsSearchOutputSchema = SkillSearchOutputSchema.extend({
  warnings: z.array(SkillLoadWarningSchema).readonly(),
});
/** Read a prepared execution's registry without scanning its working directory. */
export const SkillsListForRunArgumentsSchema = z
  .object({ runId: z.string().min(1) })
  .strict();
/** Unavailable snapshots are distinct from available snapshots with no skills. */
export const SkillsListForRunOutputSchema = SkillsListOutputSchema.extend({
  available: z.boolean(),
});
