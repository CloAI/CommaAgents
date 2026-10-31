import type { ModelFamily } from "./roles.types";

export const MODEL_ROLE_PREFIX = "@";

/** Role tried next when a role has no model; roles not listed fall back to `primary`. */
export const MODEL_ROLE_FALLBACKS: Readonly<Record<string, string>> = {
  fast: "subagent",
  compaction: "fast",
  subagent: "primary",
};

/** Model ID fragments identifying each family, checked in order against the lowercased model ID. */
export const MODEL_FAMILY_PATTERNS: ReadonlyArray<
  readonly [ModelFamily, RegExp]
> = [
  ["claude", /claude/],
  ["gpt", /(^|[/-])(gpt|o[1-9]|codex)/],
  ["gemini", /gemini|gemma/],
];
