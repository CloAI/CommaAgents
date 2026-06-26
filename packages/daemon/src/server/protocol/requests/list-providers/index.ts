// List-providers request handler.
// Returns provider discovery metadata: id, name, auth status, normalized model list.

import { getGlobalCredentialStore, listProviders } from "@comma-agents/core";

import type { HandlerContext } from "../../dispatcher.types";
import type { ProviderInfoWire } from "../../responses/provider-list";
import { toModelInfoWire } from "../../responses/provider-list/provider-list.utils";
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
      credentialType: provider.credentialType,
      authStatus: provider.authStatus,
      models: provider.models.map(toModelInfoWire),
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
