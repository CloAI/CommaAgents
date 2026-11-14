export {
  DEFAULT_GLOBAL_SKILLS_DIRECTORY_NAME as GLOBAL_SKILLS_SUBDIR,
  DEFAULT_PROJECT_DIRECTORY_NAME as PROJECT_SKILLS_SUBDIR,
} from "../defaults/defaults.constants";

/** Filename inside each skill directory. */
export const SKILL_FILENAME = "SKILL.md";

/** Maximum size of a `SKILL.md` file in bytes (256 KiB). Prevents runaway loads. */
export const SKILL_MAX_BYTES = 256 * 1024;

/** Regular expression that valid skill names must match (kebab-case, 1–64 chars). */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Accepted filenames, in preference order. */
export const SKILL_FILENAMES = ["SKILL.md", "SKILL.MD"] as const;
/** Shared global compatibility roots, lowest conflict priority first; relative to home. */
export const RECOMMENDED_GLOBAL_SKILL_DIRECTORIES = [
  ".agents/skills",
  ".comma/skills",
  ".config/comma/skills",
] as const;
/** Comma project roots are discovered through this marker, independently of Git. */
export const PROJECT_SKILL_DIRECTORY = ".comma/skills";
