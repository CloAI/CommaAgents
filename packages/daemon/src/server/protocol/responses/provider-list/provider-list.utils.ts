import type { ModelInfo } from "@comma-agents/core";
import type { ModelInfoWire } from "./provider-list.schema";

export function toModelInfoWire(model: ModelInfo): ModelInfoWire {
  return {
    id: model.id,
    ...(model.name !== undefined ? { name: model.name } : {}),
    ...(model.family !== undefined ? { family: model.family } : {}),
    ...(model.contextWindow !== undefined
      ? { contextWindow: model.contextWindow }
      : {}),
    ...(model.maxInputTokens !== undefined
      ? { maxInputTokens: model.maxInputTokens }
      : {}),
    ...(model.maxOutputTokens !== undefined
      ? { maxOutputTokens: model.maxOutputTokens }
      : {}),
    ...(model.knowledgeCutoff !== undefined
      ? { knowledgeCutoff: model.knowledgeCutoff }
      : {}),
    ...(model.releaseDate !== undefined
      ? { releaseDate: model.releaseDate }
      : {}),
    ...(model.lastUpdated !== undefined
      ? { lastUpdated: model.lastUpdated }
      : {}),
    ...(model.status !== undefined ? { status: model.status } : {}),
    ...(model.modalities !== undefined
      ? {
          modalities: {
            ...(model.modalities.input !== undefined
              ? { input: [...model.modalities.input] }
              : {}),
            ...(model.modalities.output !== undefined
              ? { output: [...model.modalities.output] }
              : {}),
          },
        }
      : {}),
    ...(model.capabilities !== undefined
      ? { capabilities: { ...model.capabilities } }
      : {}),
    ...(model.cost !== undefined ? { cost: { ...model.cost } } : {}),
  };
}
