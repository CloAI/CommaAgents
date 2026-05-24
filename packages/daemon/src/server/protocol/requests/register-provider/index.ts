// Register-provider request handler.

import {
  getProviderDefinition,
  registerProvider,
  registerProviderDefinition,
} from "@comma-agents/core";

import type { HandlerContext } from "../../dispatcher.types";
import {
  loadRegisteredProviders,
  saveRegisteredProviders,
} from "../../provider-registry";
import type { RegisterProviderMessage } from "./register-provider.schema";

export { RegisterProviderMessage } from "./register-provider.schema";

export async function handleRegisterProvider(
  message: RegisterProviderMessage,
  context: HandlerContext<"register_provider">,
): Promise<void> {
  try {
    const { providerId } = message;

    const definition = await getProviderDefinition(providerId);
    if (!definition) {
      context.reply({
        type: "error" as const,
        code: "NOT_FOUND",
        message: `Provider "${providerId}" is not known. It must be available in the models.dev catalog or as a built-in override.`,
        ts: new Date().toISOString(),
        ...(message.requestId !== undefined
          ? { requestId: message.requestId }
          : {}),
      });
      return;
    }

    const registry = loadRegisteredProviders();
    if (registry.includes(providerId)) {
      context.reply({
        type: "provider_registered" as const,
        providerId,
        ts: new Date().toISOString(),
        ...(message.requestId !== undefined
          ? { requestId: message.requestId }
          : {}),
      });
      return;
    }

    registerProviderDefinition(definition);

    const packageName = definition.packageName ?? `@ai-sdk/${providerId}`;
    registerProvider(providerId, { packageName });

    registry.push(providerId);
    saveRegisteredProviders(registry);

    context.reply({
      type: "provider_registered" as const,
      providerId,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (caughtError) {
    context.logger.error(`register_provider failed: ${caughtError}`);
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
