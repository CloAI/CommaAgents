import styles from "./ConnectionStatus.module.scss";

/** Compact connection indicator with a label revealed on hover or focus. */
export interface ConnectionStatusProps {
  /** Name of the service represented by the dot. */
  readonly label: string;
  /** Open connection diagnostics. */
  readonly onClick?: () => void;
  /** Connection health; warning is available for future latency checks. */
  readonly status: "connected" | "disconnected" | "warning";
}

/**
 * Show connection health in a half capsule that expands toward the left.
 * @param {ConnectionStatusProps} props - Service label and connection health.
 * @returns {React.ReactElement} An accessible connection status indicator.
 */
export function ConnectionStatus({
  label,
  status,
  onClick,
}: ConnectionStatusProps) {
  const description = {
    connected: "Connected",
    disconnected: "Not connected",
    warning: "Connection issue",
  }[status];
  const announcement = `${label}: ${description}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={announcement}
      data-status={status}
      className={styles.capsule}
    >
      <span aria-hidden="true" className={styles.label}>
        {label}
      </span>
      <span aria-hidden="true" className={styles.dot} />
      <span
        role="status"
        aria-label={announcement}
        className={styles.announcement}
      >
        {announcement}
      </span>
    </button>
  );
}
