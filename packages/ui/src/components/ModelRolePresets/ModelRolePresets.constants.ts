export const DEFAULT_MODEL_ROLE_PRESETS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "OpenAI balanced": {
    simple: "openai/gpt-5-mini",
    medium: "openai/gpt-5",
    complex: "openai/gpt-5",
    memory: "openai/gpt-5-mini",
    compaction: "openai/gpt-5-mini",
  },
  "OpenAI economy": {
    simple: "openai/gpt-5-mini",
    medium: "openai/gpt-5-mini",
    complex: "openai/gpt-5",
    memory: "openai/gpt-5-mini",
    compaction: "openai/gpt-5-mini",
  },
};
