import { Button } from "../../design-system/Button";
import { MODEL_CAPABILITIES } from "./ModelDetails.constants";
import type {
  DiscoveredModel,
  DiscoveredProvider,
  ModelAction,
} from "./ModelDetails.types";
import { SearchHighlight } from "../SearchHighlight";
import styles from "./ModelDetails.module.scss";

/** One model as every browser describes it. */
export interface ModelDetailsProps {
  /** Provider owning the model. */
  readonly provider: DiscoveredProvider;
  /** Model to show. */
  readonly model: DiscoveredModel;
  /** Normalized search text to highlight. */
  readonly highlightSearchQuery: string;
  /** Buttons between the ID and the capability badges, in order. */
  readonly actions?: readonly ModelAction[];
}

/**
 * Show a model's name, ID, and capabilities.
 * @param {ModelDetailsProps} props - Model, search, and actions.
 * @returns {React.ReactElement} The model's details.
 */
export function ModelDetails({
  provider,
  model,
  highlightSearchQuery,
  actions,
}: ModelDetailsProps) {
  return (
    <>
      <div className={styles.heading}>
        <strong>
          <SearchHighlight
            text={model.metadata.name ?? model.id}
            query={highlightSearchQuery}
          />
        </strong>
        <span>
          <SearchHighlight text={provider.name} query={highlightSearchQuery} />
        </span>
      </div>
      <code className={styles.modelId}>
        <SearchHighlight
          text={`${provider.id}/${model.id}`}
          query={highlightSearchQuery}
        />
      </code>
      {actions?.map(({ label, ariaLabel, action }) => (
        <Button
          key={label}
          className={styles.action}
          aria-label={ariaLabel}
          onClick={action}
        >
          {label}
        </Button>
      ))}
      <div className={styles.badges}>
        {MODEL_CAPABILITIES.filter(
          (capability) => model.metadata.capabilities?.[capability.id] === true,
        ).map((capability) => (
          <span
            key={capability.id}
            role="img"
            aria-label={capability.label}
            title={capability.label}
            tabIndex={0}
          >
            <capability.icon aria-hidden="true" className={styles.icon} />
          </span>
        ))}
      </div>
    </>
  );
}
