// Get-available-models request handler.
// Returns every model from the reverse index with credential availability
// metadata. The TUI can use this to show which models are ready to use
// and which need credentials configured.

import {
  getCatalogProviderSync,
  getGlobalCredentialStore,
  getReverseModelIndex,
  toModelInfo,
} from "@comma-agents/core";

import type { HandlerContext } from "../../dispatcher.types";
import type { AvailableModelWire } from "../../responses/available-models";
import type { ModelInfoWire } from "../../responses/provider-list";
import type { GetAvailableModelsMessage } from "./get-available-models.schema";

export { GetAvailableModelsMessage } from "./get-available-models.schema";

export async function handleGetAvailableModels(
  message: GetAvailableModelsMessage,
  context: HandlerContext<"get_available_models">,
): Promise<void> {
  try {
    const credentialStore = getGlobalCredentialStore();
    const index = getReverseModelIndex();

    const results: AvailableModelWire[] = [];

    for (const [modelId, providerIds] of index.entries()) {
      if (message.modelId && !modelId.includes(message.modelId)) continue;

      const providers: string[] = [];
      const configuredProviders: string[] = [];

      for (const providerId of providerIds) {
        providers.push(providerId);
        const authStatus = await credentialStore.getAuthStatus(
          providerId,
          message.scope,
        );
        if (authStatus === "configured") {
          configuredProviders.push(providerId);
        }
      }

      const metadata = resolveModelMetadata(modelId, providerIds);

      results.push({
        id: modelId,
        ...metadata,
        hasCredentials: configuredProviders.length > 0,
        providers,
        configuredProviders,
      });
    }

    results.sort((a, b) => a.id.localeCompare(b.id));

    context.reply({
      type: "available_models" as const,
      models: results,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (caughtError) {
    context.logger.error(`get_available_models failed: ${caughtError}`);
    context.reply({
      type: "error" as const,
      code: "INTERNAL_ERROR",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}

function resolveModelMetadata(
  modelId: string,
  providerIds: readonly string[],
): Omit<ModelInfoWire, "id"> {
  for (const providerId of providerIds) {
    const provider = getCatalogProviderSync(providerId);
    if (!provider?.models[modelId]) continue;

    const model = toModelInfo(provider.models[modelId]);
    return {
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
  return {};
}
