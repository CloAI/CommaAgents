import { formatTokens } from "../RunSection.utils";
import {
  CRITICAL_RATIO,
  RING_CIRCUMFERENCE,
  RING_RADIUS,
  WARNING_RATIO,
} from "./ContextMeter.constants";
import styles from "./ContextMeter.module.scss";

/** How full the context window is. */
export interface ContextMeterProps {
  /** Tokens in the final model step's context, when reported. */
  readonly usedTokens?: number;
  /** Size of the model's context window in tokens, when known. */
  readonly contextWindow?: number;
}

/**
 * Show a small ring, with the percentage inside it, for how much of the context window a response filled.
 * @param {ContextMeterProps} props - Component properties.
 * @returns {React.ReactElement | null} The meter, or nothing while either figure is unknown.
 */
export function ContextMeter({ usedTokens, contextWindow }: ContextMeterProps) {
  if (usedTokens === undefined || !contextWindow) {
    return null;
  }
  const ratio = Math.min(1, usedTokens / contextWindow);
  const percent = Math.round(ratio * 100);
  return (
    <span
      className={styles.contextMeter}
      role="meter"
      aria-label="Context used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      data-level={
        ratio >= CRITICAL_RATIO
          ? "critical"
          : ratio >= WARNING_RATIO
            ? "warning"
            : "ok"
      }
      title={`${formatTokens(usedTokens)} of ${formatTokens(contextWindow)} tokens`}
    >
      <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden>
        <circle className={styles.track} cx="12" cy="12" r={RING_RADIUS} />
        <circle
          className={styles.fill}
          cx="12"
          cy="12"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
        />
      </svg>
      <span className={styles.value}>{percent}</span>
    </span>
  );
}
