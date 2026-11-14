export const DEFAULT_MODEL_ROLE_PRESETS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "OpenAI": {
    simple: "openai/gpt-6-luna",
    medium: "openai/gpt-6.1-terra",
    complex: "openai/gpt-6.1-sol",
    memory: "openai/gpt-6-luna",
    compaction: "openai/gpt-6-luna",
  },
  Anthropic: {
    simple: "anthropic/claude-haiku-5-5",
    medium: "anthropic/claude-sonnet-5-5",
    complex: "anthropic/claude-opus-5-5",
    memory: "anthropic/claude-haiku-5-5",
    compaction: "anthropic/claude-haiku-5-5",
  },
  "xAI · Grok": {
    simple: "xai/grok-4.7",
    medium: "xai/grok-4.7",
    complex: "xai/grok-4.7",
    memory: "xai/grok-4.7",
    compaction: "xai/grok-4.7",
  },
  "Qwen (Alibaba)": {
    simple: "alibaba/qwen3.8-flash",
    medium: "alibaba/qwen3.7-plus",
    complex: "alibaba/qwen3.8-max",
    memory: "alibaba/qwen3.8-flash",
    compaction: "alibaba/qwen3.8-flash",
  },
  DeepSeek: {
    simple: "deepseek/deepseek-flash",
    medium: "deepseek/deepseek-flash",
    complex: "deepseek/deepseek-v4-pro",
    memory: "deepseek/deepseek-flash",
    compaction: "deepseek/deepseek-flash",
  }
};
