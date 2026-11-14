import { useCallback, useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./Accordion.module.scss";

/** A collapsible section with a named heading. */
export interface AccordionProps {
  /** Heading shown on the disclosure button. */
  readonly title: string;
  /** Content revealed when expanded. */
  readonly children: ReactNode;
  /** Expand the section initially. @default false */
  readonly defaultOpen?: boolean;
  /** Additional section styling. */
  readonly className?: string;
}

/**
 * Own the expanded state of a collapsible section.
 * @param {AccordionProps} props - Heading, content, and initial state.
 * @returns {React.ReactElement} The collapsible section.
 */
export function Accordion({ defaultOpen = false, ...props }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const handleToggle = useCallback(() => setOpen((current) => !current), []);
  return <AccordionRender {...props} open={open} onToggle={handleToggle} />;
}

/** Controlled presentation for a collapsible section. */
export interface AccordionRenderProps extends Omit<
  AccordionProps,
  "defaultOpen"
> {
  /** Whether the content is visible. */
  readonly open: boolean;
  /** Request a change to the expanded state. */
  readonly onToggle: () => void;
}

/**
 * Render a keyboard-accessible disclosure while preserving its mounted content.
 * @param {AccordionRenderProps} props - Heading, content, and disclosure state.
 * @returns {React.ReactElement} The section heading and collapsible content.
 */
export function AccordionRender({
  title,
  children,
  open,
  onToggle,
  className = "",
}: AccordionRenderProps) {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;
  const contentId = `${sectionId}-content`;
  return (
    <section className={`${styles.accordion} ${className}`}>
      <h3 className={styles.heading}>
        <button
          type="button"
          id={headingId}
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
        >
          <ChevronRight aria-hidden="true" className={styles.chevron} />
          {title}
        </button>
      </h3>
      <div
        id={contentId}
        role="region"
        aria-labelledby={headingId}
        hidden={!open}
        className={styles.content}
      >
        {children}
      </div>
    </section>
  );
}
