/** One instruction file found between the repository root and the working directory. */
export interface ProjectInstruction {
  /** Path relative to the repository root, e.g. `packages/core/AGENTS.md`. */
  readonly path: string;
  /** File contents, trimmed. */
  readonly content: string;
}

/** Git state summarized for the environment block. */
export interface GitSummary {
  /** Current branch, or `detached` when HEAD is not on a branch. */
  readonly branch: string;
  /** Count of modified, added, deleted, or renamed tracked paths. */
  readonly changed: number;
  /** Count of untracked paths. */
  readonly untracked: number;
}

/** Facts about where and when a run executes. */
export interface EnvironmentDescription {
  /** Absolute working directory. */
  readonly cwd: string;
  /** Local date as `YYYY-MM-DD`. */
  readonly date: string;
  /** Node platform identifier, e.g. `darwin` or `linux`. */
  readonly platform: string;
  /** Git summary when `cwd` is inside a repository. */
  readonly git?: GitSummary;
}

/** Which run-time blocks an agent receives in its system prompt. */
export interface ContextBlockSelection {
  /** Include `<project_instructions>` blocks from AGENTS.md-style files. */
  readonly instructions?: boolean;
  /** Include the `<environment>` block. */
  readonly environment?: boolean;
}

/** Inputs for building the run-time blocks of one agent's system prompt. */
export interface BuildContextBlocksOptions extends ContextBlockSelection {
  /** Working directory of the run. */
  readonly cwd: string;
  /** File names checked in each directory, first match wins. @default ["AGENTS.md", "CLAUDE.md"] */
  readonly instructionFiles?: readonly string[];
}
