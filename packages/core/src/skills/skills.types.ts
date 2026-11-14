import type { z } from "zod/v4";
import type {
  SkillSummarySchema,
  SkillSearchArgumentsSchema,
  SkillSearchOutputSchema,
} from "./skills.schemas";

/**
 * Frontmatter metadata for a single skill.
 *
 * Skills use YAML frontmatter in `SKILL.md` or `SKILL.MD`: a YAML
 * frontmatter block at the top of the file declares the skill's identity
 * and a short description, followed by the full instructional body.
 */
export interface SkillMetadata {
  /** Unique skill identifier. Must be kebab-case. */
  readonly name: string;
  /**
   * Action-oriented description returned by listing and fuzzy search.
   * Explain when the agent should load these instructions.
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
  /** Extra roots merged after conventional global roots; later entries win conflicts.
   * Absolute paths and ~/ paths are accepted; relative paths use the supplied workspace.
   */
  readonly additionalDirectories?: readonly string[];
  /**
   * Absolute path to the global skills directory. Each direct subdirectory
   * containing a `SKILL.md` becomes a skill. Defaults to
   * `~/.config/comma/skills/`. An override replaces all conventional global sources.
   *
   * Set to `null` to skip global discovery.
   */
  readonly globalSkillsDir?: string | null;
  /**
   * Absolute path to the project-local skills directory. Defaults to
   * the nearest ancestor `.comma/skills/`. Skills here override global ones by name.
   *
   * Set to `null` to skip project discovery.
   */
  readonly projectSkillsDir?: string | null;
}

/** Resolved skill metadata, excluding its instructions. */
export type SkillSummary = z.output<typeof SkillSummarySchema>;
/** Plain-text query and optional result limit. */
export type SkillSearchOptions = z.input<typeof SkillSearchArgumentsSchema>;
/** Ranked search results with a total before limiting. */
export type SkillSearchResult = z.output<typeof SkillSearchOutputSchema>;
/** Recoverable issue encountered while discovering skills. */
export interface SkillLoadWarning {
  /** Diagnostic category; optional for compatibility with existing consumers. */
  readonly code?: string;
  /** Skill file or discovery directory associated with the issue. */
  readonly sourcePath: string;
  /** Explanation of the recoverable problem. */
  readonly message: string;
}
/** One preparation or inspection snapshot. */
export interface SkillLoadResult {
  readonly registry: SkillRegistry;
  readonly warnings: readonly SkillLoadWarning[];
  /** Closest ancestor containing .comma; absent for a workspace without a project. */
  readonly projectRoot?: string;
}
