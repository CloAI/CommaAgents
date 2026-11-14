import { Modal } from "../../../../../design-system/Modal";
import { useCommaAgentsDaemon } from "../../../../../hooks/useCommaAgentsDaemon";
import styles from "./SkillDialog.module.scss";

/** Exact-name lookup and dismissal for the raw skill viewer. */
export interface SkillDialogProps {
  /** Discovered skill name. */
  readonly name: string;
  /** Dismiss the viewer and restore the invoking button's focus. */
  readonly onClose: () => void;
}

/**
 * Fetch a skill's complete instruction body only when its viewer opens.
 * @param {SkillDialogProps} props - Exact skill name and dismissal.
 * @returns {React.ReactElement} The requested skill viewer.
 */
export function SkillDialog({ name, onClose }: SkillDialogProps) {
  const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
    { command: "skills.get" },
    { name },
  );
  return (
    <SkillDialogRender
      name={name}
      onClose={onClose}
      content={data?.skill.content}
      isLoading={isLoading}
      error={errors?.message ?? clientError?.message}
    />
  );
}

/** Raw instruction text and request state. */
export interface SkillDialogRenderProps extends SkillDialogProps {
  /** Unrendered Markdown body returned by the daemon, excluding frontmatter. */
  readonly content?: string;
  /** Whether the skill lookup is pending. */
  readonly isLoading: boolean;
  /** Lookup or transport failure. */
  readonly error?: string;
}

/**
 * Display raw instructions as text, without interpreting Markdown or HTML.
 * @param {SkillDialogRenderProps} props - Raw instructions and lookup feedback.
 * @returns {React.ReactElement} The scrollable instruction modal.
 */
export function SkillDialogRender({
  name,
  onClose,
  content,
  isLoading,
  error,
}: SkillDialogRenderProps) {
  return (
    <Modal
      open
      title={`Skill: ${name}`}
      onClose={onClose}
      className={styles.dialog}
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : isLoading ? (
        <p role="status">Loading skill...</p>
      ) : (
        <pre
          className={styles.text}
          tabIndex={0}
          aria-label="Raw skill instructions"
        >
          {content}
        </pre>
      )}
    </Modal>
  );
}
