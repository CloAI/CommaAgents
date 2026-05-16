/** Subdirectory under the OS config root holding global skills. */
export const GLOBAL_SKILLS_SUBDIR = "comma-agents/skills";

/** Subdirectory under the project workspace holding project-local skills. */
export const PROJECT_SKILLS_SUBDIR = ".comma/skills";

/** Filename inside each skill directory. */
export const SKILL_FILENAME = "SKILL.md";

/** Maximum size of a `SKILL.md` file in bytes (256 KiB). Prevents runaway loads. */
export const SKILL_MAX_BYTES = 256 * 1024;

/** Regular expression that valid skill names must match (kebab-case, 1–64 chars). */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
