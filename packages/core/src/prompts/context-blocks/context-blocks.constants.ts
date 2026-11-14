export const DEFAULT_INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

/** Instruction files larger than this are cut, so one oversized file cannot consume the context window. */
export const MAX_INSTRUCTION_CHARACTERS = 20_000;
