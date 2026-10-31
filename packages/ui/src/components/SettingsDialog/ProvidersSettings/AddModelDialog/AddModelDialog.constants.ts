import type { CapabilityDraft, ModelDraft } from "./AddModelDialog.types";

export const EMPTY_MODEL_DRAFT: ModelDraft = {
  modelId: "",
  name: "",
  contextWindow: "",
  maxInputTokens: "",
  maxOutputTokens: "",
  knowledgeCutoff: "",
  releaseDate: "",
  lastUpdated: "",
  status: "",
  inputCost: "",
  outputCost: "",
  reasoningCost: "",
  cacheReadCost: "",
  cacheWriteCost: "",
};
export const EMPTY_CAPABILITIES: CapabilityDraft = {
  tools: false,
  reasoning: false,
  vision: false,
  attachment: false,
  structuredOutput: false,
  teeAttestation: false,
  e2ee: false,
};
export const TOKEN_FIELDS = [
  { key: "contextWindow", label: "Context window" },
  { key: "maxInputTokens", label: "Maximum input tokens" },
  { key: "maxOutputTokens", label: "Maximum output tokens" },
] as const;
export const COST_FIELDS = [
  { key: "inputCost", metadataKey: "input", label: "Input" },
  { key: "outputCost", metadataKey: "output", label: "Output" },
  { key: "reasoningCost", metadataKey: "reasoning", label: "Reasoning" },
  { key: "cacheReadCost", metadataKey: "cacheRead", label: "Cache read" },
  { key: "cacheWriteCost", metadataKey: "cacheWrite", label: "Cache write" },
] as const;
export const MODALITIES = ["text", "image", "audio", "video", "pdf"] as const;
