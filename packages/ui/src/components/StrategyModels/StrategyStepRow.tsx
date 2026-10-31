import { Button } from "../../design-system/Button";
import type { StepRow } from "../../hooks/useStrategyModels";
import type { ModelIssue } from "./StrategyModels.utils";
import styles from "./StrategyModels.module.scss";

/** One step with its agent, effective model, and model actions. */
export interface StrategyStepRowProps {
  /** Step joined with its agent and override. */
  readonly row: StepRow;
  /** Problem with the effective model, once providers are known. */
  readonly issue?: ModelIssue;
  /** Open the model picker for this step's agent. */
  readonly onChange: (agent: string) => void;
  /** Remove this step's agent override. */
  readonly onReset: (agent: string) => void;
}

/**
 * Show what a step uses and, for LLM agents, let the user change its model.
 * @param {StrategyStepRowProps} props - Component properties.
 * @returns {React.ReactElement} The step as a list item.
 */
export function StrategyStepRow({
  row,
  issue,
  onChange,
  onReset,
}: StrategyStepRowProps) {
  const description = row.description ?? row.agentDescription;
  return (
    <li className={styles.step}>
      <div className={styles.stepHeader}>
        <strong>{row.agent}</strong>
        {row.role === "observer" && (
          <span className={styles.tag}>Observer</span>
        )}
        {row.sharedBy > 1 && (
          <span className={styles.tag}>Shared by {row.sharedBy} steps</span>
        )}
      </div>
      {description && <p className={styles.description}>{description}</p>}
      {row.kind === "llm" ? (
        <>
          <div className={styles.model}>
            {row.effectiveModel ? (
              <code>{row.effectiveModel}</code>
            ) : (
              row.modelRole && (
                <span className={styles.issue}>
                  No model configured for @{row.modelRole}
                </span>
              )
            )}
            {row.modelRole && !row.override && (
              <span
                className={styles.tag}
                title={`The strategy uses its @${row.modelRole} model here`}
              >
                @{row.modelRole}
              </span>
            )}
            {row.override && (
              <span className={styles.tag} data-tone="primary">
                Overridden
              </span>
            )}
            {issue && (
              <span className={styles.issue} data-issue={issue}>
                {issue}
              </span>
            )}
            <span className={styles.actions}>
              <Button
                className={styles.action}
                aria-label={`Change model for ${row.agent}`}
                onClick={() => onChange(row.agent)}
              >
                Change
              </Button>
              {row.override && (
                <Button
                  className={styles.action}
                  aria-label={`Reset model for ${row.agent}`}
                  onClick={() => onReset(row.agent)}
                >
                  Reset
                </Button>
              )}
            </span>
          </div>
          {row.override && (
            <p className={styles.description}>
              Strategy default: {row.defaultModel ?? "none"}
              {row.modelRole && ` (@${row.modelRole})`}
            </p>
          )}
        </>
      ) : (
        <p className={styles.description}>
          {row.kind === "user" ? "Asks you for input" : "Custom agent"}
        </p>
      )}
    </li>
  );
}
