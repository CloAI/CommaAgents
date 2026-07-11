import {
  getProviderDefinition,
  registerProviderDefinition,
} from "@comma-agents/core";
import type { Logger } from "../../logger";
import { loadRegisteredProviders } from "../../server/protocol/provider-registry";

export async function hydrateRegisteredProviders(
  logger: Logger,
): Promise<void> {
  for (const providerId of loadRegisteredProviders()) {
    try {
      const definition = await getProviderDefinition(providerId);
      if (definition) {
        registerProviderDefinition(definition);
      }
    } catch {
      logger.warn(`There was an issue registering ${providerId}`);
    }
  }
}
