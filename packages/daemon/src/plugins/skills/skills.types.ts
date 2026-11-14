import type {
  Skill,
  SkillSummary,
  SkillLoadWarning,
  LoadSkillsOptions,
  searchSkills,
} from "@comma-agents/core/skills";
import type { Plugin } from "../../daemon-plugin";
import type { RunsPlugin } from "../runs";

/** Dependencies and discovery settings used for workspace and prepared-run skills. */
export interface CreateSkillsPluginOptions {
  /** Discovery roots applied equally to workspace queries and run preparation. */
  readonly discovery?: LoadSkillsOptions;
  /** Feature services supplied by the daemon. */
  readonly dependencies: { readonly runs: RunsPlugin };
}

/** Workspace whose current skill files should be scanned. */
export interface SkillsWorkspaceOptions {
  /** Working directory; defaults to the daemon process working directory. */
  readonly cwd?: string;
}
/** Current effective skill metadata and non-fatal discovery diagnostics. */
export interface SkillsListResult {
  readonly skills: readonly SkillSummary[];
  readonly warnings: readonly SkillLoadWarning[];
}
/** Skills attached to an execution; unavailable after cleanup or for unknown runs. */
export interface RunSkillsResult extends SkillsListResult {
  readonly available: boolean;
}
/** Reusable core-backed discovery and preparation-owned skill snapshots. */
export interface SkillsPlugin extends Plugin<"skills"> {
  /** Scan workspace discovery roots without preparing or changing a run. */
  list(options?: SkillsWorkspaceOptions): Promise<SkillsListResult>;
  /** Read one resolved skill by exact name; unknown names produce NOT_FOUND. */
  get(options: SkillsWorkspaceOptions & { readonly name: string }): Promise<{
    readonly skill: Skill;
    readonly warnings: readonly SkillLoadWarning[];
  }>;
  /** Search current skill metadata using the shared core search implementation. */
  search(
    options: SkillsWorkspaceOptions & {
      readonly query: string;
      readonly limit?: number;
    },
  ): Promise<
    ReturnType<typeof searchSkills> & {
      readonly warnings: readonly SkillLoadWarning[];
    }
  >;
  /** Read the preparation snapshot without re-scanning files. */
  listForRun(options: { readonly runId: string }): RunSkillsResult;
  /** Compatibility API: full loaded skills, or [] after cleanup/for unknown runs. */
  listSkills(runId: string): readonly Skill[];
}
