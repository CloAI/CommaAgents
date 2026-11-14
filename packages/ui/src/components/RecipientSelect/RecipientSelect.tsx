import type { ComposerRecipient } from "../../hooks/runs";
import styles from "./RecipientSelect.module.scss";

/** Agents a message can go to and the current choice. */
export interface RecipientSelectProps {
  /** Whether the message answers waiting agents or steers working ones. */
  readonly mode: "reply" | "steer";
  /** Available recipients, numbered in order. */
  readonly recipients: readonly ComposerRecipient[];
  /** Chosen recipient ID, if any. */
  readonly value: string | undefined;
  /** Choose a recipient by ID. */
  readonly onChange: (id: string) => void;
}

/**
 * Choose which agent receives the message when several can.
 * @param {RecipientSelectProps} props - Component properties.
 * @returns {React.ReactElement} A labelled agent picker.
 */
export function RecipientSelect({
  mode,
  recipients,
  value,
  onChange,
}: RecipientSelectProps) {
  const replying = mode === "reply";
  return (
    <label className={styles.recipient}>
      {replying ? "Reply to" : "Steer agent"}
      <select
        aria-label={replying ? "Reply recipient" : "Steering recipient"}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          Choose an agent
        </option>
        {recipients.map((entry, index) => (
          <option key={entry.id} value={entry.id}>
            {entry.name} ({index + 1})
          </option>
        ))}
      </select>
    </label>
  );
}
