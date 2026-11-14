/** Tools that read the skill registry; agents without one of them do not see the skill list. */
export const SKILL_TOOL_NAMES: readonly string[] = [
  "load_skill",
  "list_skills",
  "search_skills",
];

/** Template variable carrying run-time context blocks into templated system prompts. */
export const CONTEXT_BLOCKS_VARIABLE = "comma_context_blocks";

/** Subagent references matching this are strategy files rather than strategy names. */
export const STRATEGY_FILE_PATTERN = /\.(jsonc?|ya?ml)$/i;

/** Template variable holding the agent's model family: `claude`, `gpt`, `gemini`, or `other`. */
export const MODEL_FAMILY_VARIABLE = "model_family";
