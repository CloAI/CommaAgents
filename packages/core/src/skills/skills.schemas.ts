import { z } from "zod/v4";

/** Metadata returned by inspection and search without instruction bodies. */
export const SkillSummarySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  sourcePath: z.string(),
  origin: z.enum(["global", "project"]),
});
/** Full resolved skill, including instructions. */
export const SkillSchema = SkillSummarySchema.extend({ content: z.string() });
/** Recoverable discovery diagnostic. Missing optional projects are logged separately. */
export const SkillLoadWarningSchema = z.object({
  code: z.string().optional(),
  sourcePath: z.string(),
  message: z.string(),
});
/** Search plain text against names and descriptions. */
export const SkillSearchArgumentsSchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();
/** Ranked metadata; a lower score is a closer match. */
export const SkillSearchMatchSchema = SkillSummarySchema.extend({
  score: z.number().min(0).max(1),
});
/** Search candidates and their total before limiting. */
export const SkillSearchOutputSchema = z.object({
  matches: z.array(SkillSearchMatchSchema),
  totalMatches: z.number().int().nonnegative(),
});
