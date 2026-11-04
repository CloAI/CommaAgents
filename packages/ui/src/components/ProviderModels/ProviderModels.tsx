import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "../../design-system/Button";
import { SearchHighlight } from "../SearchHighlight";
import type {
  DiscoveredModel,
  DiscoveredProvider,
  ProviderAction,
  ProviderStatus,
  ProviderVerification,
} from "./ProviderModels.types";
import { providerStatus } from "./ProviderModels.utils";
import styles from "./ProviderModels.module.scss";

/** A provider's matching models and the consumer's controls around them. */
export interface ProviderModelsProps {
  /** Provider shown in the heading. */
  readonly provider: DiscoveredProvider;
  /** Matching models, all shown when expanded. */
  readonly models: readonly DiscoveredModel[];
  /** Normalized search text to highlight. */
  readonly searchQuery: string;
  /** Latest explicit credential check, when the consumer tracks one. */
  readonly verification?: ProviderVerification;
  /** Show the model list initially. @default false */
  readonly defaultExpanded?: boolean;
  /** Buttons beside the heading in order, given the provider's status. */
  readonly actions?: (status: ProviderStatus) => readonly ProviderAction[];
  /** Content of one model's list item. */
  readonly renderModel: (model: DiscoveredModel) => ReactNode;
}

/**
 * Collapse a provider's models under a heading with its connection status.
 * @param {ProviderModelsProps} props - Provider, matching models, search, actions, and model content.
 * @returns {React.ReactElement} Provider heading and collapsible model items.
 */
export function ProviderModels({
  provider,
  models,
  searchQuery,
  verification,
  defaultExpanded = false,
  actions,
  renderModel,
}: ProviderModelsProps) {
  const [isExpanded, setExpanded] = useState(defaultExpanded);
  const listId = useId();
  const status = providerStatus(provider, verification);
  return (
    <div className={styles.providerModels}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.heading}
          aria-expanded={isExpanded}
          aria-controls={listId}
          onClick={() => setExpanded((previous) => !previous)}
        >
          <ChevronRight aria-hidden="true" className={styles.chevron} />
          <span
            role="img"
            aria-label={status.description}
            title={status.description}
            data-status={status.indicator}
            className={styles.status}
          />
          <span className={styles.name}>
            <SearchHighlight text={provider.name} query={searchQuery} />
          </span>
          <span className={styles.count}>
            ({models.length} {models.length === 1 ? "model" : "models"})
          </span>
          <span className={styles.connection}>{status.connectionLabel}</span>
        </button>
        {actions?.(status).map(({ label, ariaLabel, action }, index) => (
          // Positional keys keep focus while a label changes, e.g. from "Connect" to "Configure".
          <Button
            key={index}
            className={styles.action}
            aria-label={ariaLabel}
            onClick={action}
          >
            {label}
          </Button>
        ))}
      </div>
      <ul
        id={listId}
        hidden={!isExpanded}
        className={styles.models}
        aria-label={`${provider.name} models`}
      >
        {isExpanded &&
          models.map((model) => (
            <li key={model.id} className={styles.model}>
              {renderModel(model)}
            </li>
          ))}
      </ul>
      {isExpanded && models.length === 0 && (
        <p className={styles.empty}>No models have been added.</p>
      )}
    </div>
  );
}
