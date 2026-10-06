import { getLogger } from "@logtape/logtape";
import {
  getProviderDefinition,
  registerProviderDefinition,
} from "@comma-agents/core";
import { loadRegisteredProviders } from "../../server/protocol/provider-registry";

const logger = getLogger(["comma", "daemon", "providers"]);

export async function hydrateRegisteredProviders(): Promise<void> {
  for (const providerId of loadRegisteredProviders()) {
    try {
      const definition = await getProviderDefinition(providerId);
      if (definition) {
        registerProviderDefinition(definition);
      }
    } catch {
      logger.warning(`There was an issue registering ${providerId}`);
    }
  }
}
