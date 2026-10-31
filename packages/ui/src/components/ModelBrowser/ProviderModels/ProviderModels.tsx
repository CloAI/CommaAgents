import { useId, useState } from "react";
import { Button } from "../../../design-system/Button";
import { ChevronRight } from "lucide-react";
import { MODEL_CAPABILITIES } from "../ModelBrowser.constants";
// import { ModelPagination } from "./ModelPagination";
// import { MODELS_PER_PAGE } from "../ModelBrowser.constants";
import type {
  DiscoveredModel,
  DiscoveredProvider,
  ProviderVerification,
} from "../ModelBrowser.types";
import { SearchHighlight } from "../SearchHighlight";
import styles from "./ProviderModels.module.scss";

/** Filtered models grouped under their provider. */
export interface ProviderModelsProps {
  /** Provider identity used in the heading and existing model rows. */
  readonly provider: DiscoveredProvider;
  /** All matching models shown when expanded; paging is temporarily disabled. */
  readonly models: readonly DiscoveredModel[];
  /** Current literal search term. */
  readonly query: string;
  /** Current screen's latest explicit credential check. */
  readonly verification?: ProviderVerification;
  /** Open the owning provider settings workflow. */
  readonly onConfigure?: (provider: DiscoveredProvider) => void;
  /** Fetch the selected provider's current model list. */
  readonly onRefresh?: (providerId: string) => void;
  /** Whether this provider is refreshing. */
  readonly refreshing?: boolean;
  /** Whether another model request prevents starting a refresh. */
  readonly refreshDisabled?: boolean;
  /** Refresh failure displayed beside this provider. */
  readonly refreshError?: string;
  /** Remove an entry from user configuration only. */
  readonly onRemoveModel?: (
    provider: DiscoveredProvider,
    modelId: string,
  ) => void;
  /** Make models selectable and hide provider management actions. */
  readonly onPick?: (
    provider: DiscoveredProvider,
    model: DiscoveredModel,
  ) => void;
  /** Model marked as the current choice while picking. */
  readonly selectedModelId?: string;
  /** Reason a model cannot be picked, or undefined when it can. */
  readonly isDisabled?: (
    provider: DiscoveredProvider,
    model: DiscoveredModel,
  ) => string | undefined;
  /** Show the model list initially. @default false */
  readonly defaultExpanded?: boolean;
}

/**
 * Collapse a provider's models while retaining the existing model-row presentation.
 * @param {ProviderModelsProps} props - Provider, visible models, and search context.
 * @returns {React.ReactElement} Provider heading, counts, and collapsible model rows.
 */
export function ProviderModels({
  provider,
  models,
  query,
  verification,
  onConfigure,
  onRefresh,
  refreshing = false,
  refreshDisabled = false,
  refreshError,
  onRemoveModel,
  onPick,
  selectedModelId,
  isDisabled,
  defaultExpanded = false,
}: ProviderModelsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const picking = onPick !== undefined;
  const connected =
    provider.authStatus === "configured" || provider.credentialType === "none";
  const action = connected ? "Configure" : "Connect";
  const verified = verification?.status === "verified";
  const verificationIssue =
    verification &&
    !["verified", "unsupported", "unconfigured"].includes(verification.status);
  const connectionLabel = verified
    ? "Verified"
    : connected
      ? "Connected"
      : "Needs credentials";
  const listId = useId();
  // Paging is paused. Keep ModelPagination available for re-enabling it later.
  // const [page, setPage] = useState(0);
  // const pageCount = Math.ceil(models.length / MODELS_PER_PAGE);
  // const visible = models.slice(page * MODELS_PER_PAGE, (page + 1) * MODELS_PER_PAGE);
  const visible = models;
  const status =
    provider.discovery.error || verificationIssue
      ? "warning"
      : connected
        ? "configured"
        : "unconfigured";
  const statusLabel = `${provider.name}: ${connectionLabel}. ${verified ? "Authenticated model-list check passed." : "Configuration status; access not verified."}${verificationIssue ? ` Verification: ${verification.status}.` : ""}${provider.discovery.error ? ` Discovery issue: ${provider.discovery.error}` : ""}`;
  return (
    <>
      <div className={styles.group}>
        <div className={styles.providerRow}>
          <button
            type="button"
            className={styles.providerHeading}
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((previous) => !previous)}
          >
            <ChevronRight aria-hidden="true" className={styles.chevron} />
            <span
              role="img"
              aria-label={statusLabel}
              title={statusLabel}
              data-status={status}
              className={styles.status}
            />
            <span className={styles.providerName}>
              <SearchHighlight text={provider.name} query={query} />
            </span>
            <span className={styles.count}>
              ({models.length} {models.length === 1 ? "model" : "models"})
            </span>
            <span className={styles.connectionLabel}>{connectionLabel}</span>
          </button>
          {onRefresh && (
            <Button
              className={styles.action}
              aria-label={`Refresh ${provider.name} models`}
              onClick={() => onRefresh(provider.id)}
              disabled={refreshDisabled || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          )}
          {!picking && (
            <Button
              className={styles.action}
              aria-label={`${action} ${provider.name}`}
              onClick={() => onConfigure?.(provider)}
            >
              {action}
            </Button>
          )}
        </div>
        {refreshError && (
          <p role="alert">
            Could not refresh {provider.name} models: {refreshError}
          </p>
        )}
        <ul
          id={listId}
          hidden={!expanded}
          className={styles.models}
          aria-label={`${provider.name} models`}
        >
          {(expanded ? visible : []).map((model) => {
            const reason = isDisabled?.(provider, model);
            const selected = model.id === selectedModelId;
            const content = (
              <>
                <div className={styles.modelHeading}>
                  <strong>
                    <SearchHighlight
                      text={model.metadata.name ?? model.id}
                      query={query}
                    />
                  </strong>
                  <span>
                    <SearchHighlight text={provider.name} query={query} />
                  </span>
                </div>
                <code className={styles.modelId}>
                  <SearchHighlight
                    text={`${provider.id}/${model.id}`}
                    query={query}
                  />
                </code>
                {model.sources.length === 1 &&
                  model.sources[0] === "user" &&
                  onRemoveModel && (
                    <Button
                      className={styles.removeModel}
                      aria-label={`Remove custom model ${model.id}`}
                      onClick={() => onRemoveModel(provider, model.id)}
                    >
                      Remove
                    </Button>
                  )}
                <div className={styles.badges}>
                  {MODEL_CAPABILITIES.filter(
                    (capability) =>
                      model.metadata.capabilities?.[capability.id] === true,
                  ).map((capability) => (
                    <span
                      key={capability.id}
                      role="img"
                      aria-label={capability.label}
                      title={capability.label}
                      tabIndex={0}
                    >
                      <capability.icon
                        aria-hidden="true"
                        className={styles.capabilityIcon}
                      />
                    </span>
                  ))}
                </div>
              </>
            );
            return (
              <li key={model.id} className={styles.model}>
                {picking ? (
                  <>
                    <button
                      type="button"
                      className={styles.pick}
                      aria-current={selected ? "true" : undefined}
                      disabled={reason !== undefined}
                      onClick={() => onPick(provider, model)}
                    >
                      {content}
                    </button>
                    {selected && <span className={styles.note}>Selected</span>}
                    {reason && <span className={styles.note}>{reason}</span>}
                  </>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
        {expanded && models.length === 0 && (
          <p className={styles.empty}>No models have been added.</p>
        )}
        {/* Pagination intentionally disabled; all matching models are shown on expansion.
      <ModelPagination label={`${provider.name} model pages`} page={page}
        pageCount={pageCount} onPageChange={setPage} />
      */}
      </div>
    </>
  );
}
