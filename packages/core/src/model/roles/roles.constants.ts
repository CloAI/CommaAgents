import type { ModelFamily, ModelRoleDefinition } from "./roles.types";

export const MODEL_ROLE_PREFIX = "@";

/** Roles every daemon offers for configuration; strategies may reference any other role name too. */
export const DEFAULT_MODEL_ROLES: readonly ModelRoleDefinition[] = [
  {
    name: "simple",
    description: "Fast, inexpensive work such as search and summaries",
  },
  { name: "medium", description: "Everyday agent work" },
  { name: "complex", description: "Hard reasoning and large changes" },
  { name: "memory", description: "Extracting and organizing memories" },
  {
    name: "compaction",
    description: "Summarizing conversations to free context",
  },
];

/** Model ID fragments identifying each family, checked in order against the lowercased model ID. */
export const MODEL_FAMILY_PATTERNS: ReadonlyArray<
  readonly [ModelFamily, RegExp]
> = [
  ["claude", /claude/],
  ["gpt", /(^|[/-])(gpt|o[1-9]|codex)/],
  ["gemini", /gemini|gemma/],
];
