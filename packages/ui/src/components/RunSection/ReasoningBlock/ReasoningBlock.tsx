import { Brain } from "lucide-react";
import { MarkdownBlock } from "../MarkdownBlock";
import styles from "./ReasoningBlock.module.scss";

/** The reasoning to show. */
export interface ReasoningBlockProps {
  /** Reasoning text the agent produced before answering. */
  readonly text: string;
}

/**
 * Keep an agent's reasoning folded away until asked for.
 * @param {ReasoningBlockProps} props - Component properties.
 * @returns {React.ReactElement} The collapsed reasoning.
 */
export function ReasoningBlock({ text }: ReasoningBlockProps) {
  return (
    <details className={styles.reasoningBlock}>
      <summary className={styles.summary}>
        <Brain size={14} aria-hidden />
        Reasoning
      </summary>
      <div className={styles.content}>
        <MarkdownBlock text={text} />
      </div>
    </details>
  );
}
