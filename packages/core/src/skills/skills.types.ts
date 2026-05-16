/**
 * Frontmatter metadata for a single skill.
 *
 * Skills follow the Anthropic / opencode `SKILL.md` convention: a YAML
 * frontmatter block at the top of the file declares the skill's identity
 * and a short description, followed by the full instructional body.
 */
export interface SkillMetadata {
  /** Unique skill identifier. Must be kebab-case. */
  readonly name: string;
  /**
   * Short, action-oriented description shown to the LLM in the system
   * prompt header. Used to decide whether to call `load_skill`. Should
   * fit on one line and answer "when should I load this?".
   */
  readonly description: string;
}

/**
 * A fully loaded skill — metadata plus the body of its `SKILL.md`.
 */
export interface Skill extends SkillMetadata {
  /** Markdown body of the skill (frontmatter stripped). */
  readonly content: string;
  /** Absolute path to the source `SKILL.md` file. */
  readonly sourcePath: string;
  /**
   * Origin of the skill. Project skills override global skills with the
   * same `name`.
   */
  readonly origin: "global" | "project";
}

/**
 * In-memory skill registry. Holds resolved skills keyed by name and
 * exposes lookup / listing for the loader, the system-prompt header
 * builder, and the `load_skill` tool.
 */
export interface SkillRegistry {
  /** Register or replace a skill. Project skills override global ones by name. */
  register(skill: Skill): void;
  /** Look up a skill by name. */
  get(name: string): Skill | undefined;
  /** All registered skills, sorted by `name`. */
  list(): readonly Skill[];
  /** True when no skills are registered. */
  isEmpty(): boolean;
}

/**
 * Options for {@link loadSkills}.
 */
export interface LoadSkillsOptions {
  /**
   * Absolute path to the global skills directory. Each direct subdirectory
   * containing a `SKILL.md` becomes a skill. Defaults to
   * `<configRoot>/comma-agents/skills/`.
   *
   * Set to `null` to skip global discovery.
   */
  readonly globalSkillsDir?: string | null;
  /**
   * Absolute path to the project-local skills directory. Defaults to
   * `<cwd>/.comma/skills/`. Skills here override global ones by name.
   *
   * Set to `null` to skip project discovery.
   */
  readonly projectSkillsDir?: string | null;
}
