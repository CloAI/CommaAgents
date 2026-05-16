import type { z } from "zod";
import type { loadSkillParams } from "./load-skill";

export interface LoadSkillData {
  /** The skill's identifier. */
  readonly name: string;
  /** The one-line description shown in the system prompt. */
  readonly description: string;
  /** Full markdown body of the skill (frontmatter stripped). */
  readonly content: string;
  /** Absolute path to the source `SKILL.md` for debugging / provenance. */
  readonly sourcePath: string;
  /** Whether the skill came from the global config dir or the project. */
  readonly origin: "global" | "project";
}

export type LoadSkillParams = z.infer<typeof loadSkillParams>;
