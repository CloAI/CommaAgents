// List-providers request handler.
// Returns provider discovery metadata: id, name, auth status, normalized model list.

import type { ModelInfo } from "@comma-agents/core";
import { getGlobalCredentialStore, listProviders } from "@comma-agents/core";

import type { HandlerContext } from "../../dispatcher.types";
import type {
  ModelInfoWire,
  ProviderInfoWire,
} from "../../responses/provider-list";
import type { ListProvidersMessage } from "./list-providers.schema";

export { ListProvidersMessage } from "./list-providers.schema";

/**
 * Handle a `list_providers` request by aggregating provider discovery
 * metadata from the models.dev catalog and the global credential store.
 *
 * When `message.live === true`, providers with a live lister (Ollama,
 * GitHub Copilot) are queried directly and the results are merged with
 * the catalog. Otherwise the response contains catalog data only.
 */
export async function handleListProviders(
  message: ListProvidersMessage,
  context: HandlerContext<"list_providers">,
): Promise<void> {
  try {
    const credentialStore = getGlobalCredentialStore();
    const providers = await listProviders(credentialStore, {
      ...(message.scope !== undefined ? { scope: message.scope } : {}),
      live: message.live ?? false,
    });

    const wireProviders: ProviderInfoWire[] = providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      authStatus: provider.authStatus,
      models: provider.models.map(toWireModel),
      modelsSource: provider.modelsSource,
      ...(provider.fetchedAt !== undefined
        ? { fetchedAt: provider.fetchedAt }
        : {}),
      ...(provider.error !== undefined ? { error: provider.error } : {}),
      isCustom: provider.isCustom,
    }));

    context.reply({
      type: "provider_list" as const,
      providers: wireProviders,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (caughtError) {
    context.logger.error(`list_providers failed: ${caughtError}`);
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

function toWireModel(model: ModelInfo): ModelInfoWire {
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
