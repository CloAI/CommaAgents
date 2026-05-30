// Unregister-provider request handler.

import {
  unregisterProvider,
  unregisterProviderDefinition,
} from "@comma-agents/core";

import type { HandlerContext } from "../../dispatcher.types";
import {
  loadRegisteredProviders,
  saveRegisteredProviders,
} from "../../provider-registry";
import type { UnregisterProviderMessage } from "./unregister-provider.schema";

export { UnregisterProviderMessage } from "./unregister-provider.schema";

export function handleUnregisterProvider(
  message: UnregisterProviderMessage,
  context: HandlerContext<"unregister_provider">,
): void {
  try {
    const { providerId } = message;

    const registry = loadRegisteredProviders();
    if (!registry.includes(providerId)) {
      context.reply({
        type: "provider_unregistered" as const,
        providerId,
        ts: new Date().toISOString(),
        ...(message.requestId !== undefined
          ? { requestId: message.requestId }
          : {}),
      });
      return;
    }

    unregisterProvider(providerId);
    unregisterProviderDefinition(providerId);

    const updated = registry.filter((id) => id !== providerId);
    saveRegisteredProviders(updated);

    context.reply({
      type: "provider_unregistered" as const,
      providerId,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (caughtError) {
    context.logger.error(`unregister_provider failed: ${caughtError}`);
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
