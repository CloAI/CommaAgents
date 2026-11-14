import { ModelDetails } from "../../../ModelDetails";
import { ProviderModels } from "../../../ProviderModels";
import type {
  DiscoveredModel,
  DiscoveredProvider,
  ProviderModal,
  ProviderVerification,
} from "../ProvidersSettings.types";

/** A provider's matching models and the settings actions on them. */
export interface ManagedProviderProps {
  /** Provider shown in the heading. */
  readonly provider: DiscoveredProvider;
  /** Matching models. */
  readonly models: readonly DiscoveredModel[];
  /** Normalized search text to highlight. */
  readonly searchQuery: string;
  /** This provider's latest credential check. */
  readonly verification?: ProviderVerification;
  /** Open a provider modal about this provider or one of its models. */
  readonly onOpen: (
    modal: ProviderModal,
    provider: DiscoveredProvider,
    modelId?: string,
  ) => void;
}

/**
 * Group a provider's models with credential and removal actions.
 * @param {ManagedProviderProps} props - Provider, models, search, and requests.
 * @returns {React.ReactElement} The managed provider group.
 */
export function ManagedProvider({
  provider,
  models,
  searchQuery,
  verification,
  onOpen,
}: ManagedProviderProps) {
  return (
    <ProviderModels
      provider={provider}
      models={models}
      searchQuery={searchQuery}
      verification={verification}
      actions={({ actionLabel }) => [
        {
          label: actionLabel,
          ariaLabel: `${actionLabel} ${provider.name}`,
          action: () => onOpen("configureProvider", provider),
        },
      ]}
      renderModel={(model) => (
        <ModelDetails
          provider={provider}
          model={model}
          highlightSearchQuery={searchQuery}
          actions={
            model.sources.length === 1 && model.sources[0] === "user"
              ? [
                  {
                    label: "Remove",
                    ariaLabel: `Remove custom model ${model.id}`,
                    action: () => onOpen("removeModel", provider, model.id),
                  },
                ]
              : undefined
          }
        />
      )}
    />
  );
}
