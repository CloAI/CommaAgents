import { useMemo } from "react";
import { useCommaAgentsDaemon } from "../../hooks/useCommaAgentsDaemon";
import type { DiscoveredModel, DiscoveredProvider } from "../ModelPicker";

/** A model of a connected provider, ready to list in a dropdown. */
export interface ModelChoice {
  /** `providerID/modelID`, the value a role stores. */
  readonly value: string;
  readonly label: string;
  readonly group: string;
  readonly capabilities: DiscoveredModel["metadata"]["capabilities"];
}

/** Models of connected providers and whether they can be listed. */
export interface ModelChoices {
  readonly status: "loading" | "error" | "empty" | "ready";
  readonly choices: readonly ModelChoice[];
  /** Provider names in display order. */
  readonly groups: readonly string[];
}

function isConnected(provider: DiscoveredProvider): boolean {
  return (
    provider.authStatus === "configured" || provider.credentialType === "none"
  );
}

/**
 * Load the models of connected providers for dropdown choices.
 * @returns {ModelChoices} Choices grouped by provider and the loading state.
 */
export function useModelChoices(): ModelChoices {
  const { data, errors, clientError } = useCommaAgentsDaemon(
    { channel: "core.providers.list" },
    {},
  );
  return useMemo(() => {
    const connected = (data?.data.providers ?? []).filter(isConnected);
    const choices = connected.flatMap((provider) =>
      provider.models.map((model) => ({
        value: `${provider.id}/${model.id}`,
        label: model.metadata.name ?? model.id,
        group: provider.name,
        capabilities: model.metadata.capabilities,
      })),
    );
    return {
      // The list is loading until its first snapshot, not just the subscription acknowledgement.
      status:
        errors || clientError
          ? "error"
          : !data
            ? "loading"
            : choices.length === 0
              ? "empty"
              : "ready",
      choices,
      groups: connected.map((provider) => provider.name),
    };
  }, [data, errors, clientError]);
}
