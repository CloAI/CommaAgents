import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { IconButton } from "../../design-system/IconButton";
import styles from "./ChatComposer.module.scss";

/** Input, strategy controls, and current composer notices. */
export interface ChatComposerProps {
  /** Controls above the input. */
  readonly controls?: ReactNode;
  /** Current issues; resolved issues are removed by the caller. */
  readonly warnings?: readonly string[];
  /** Input and any recipient controls. */
  readonly children: ReactNode;
}

/**
 * Group the composer and page through dismissible notices.
 * @param {ChatComposerProps} props - Controls, notices, and input content.
 * @returns {React.ReactElement} The combined composer.
 */
export function ChatComposer({
  controls,
  warnings = [],
  children,
}: ChatComposerProps) {
  // A changed set of issues gets a fresh pager and dismissal state.
  return (
    <div className={styles.chatComposer}>
      <ComposerWarnings key={JSON.stringify(warnings)} warnings={warnings} />
      <div className={styles.frame}>
        {controls && <div className={styles.controls}>{controls}</div>}
        {children}
      </div>
    </div>
  );
}

interface ComposerWarningsProps {
  /** Active warning messages. */
  readonly warnings: readonly string[];
}

function ComposerWarnings({ warnings }: ComposerWarningsProps) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || warnings.length === 0) {
    return null;
  }
  return (
    <div className={styles.warning}>
      <p role="alert">{warnings[index]}</p>
      <div className={styles.pager}>
        {warnings.length > 1 && (
          <>
            <IconButton
              label="Previous warning"
              onClick={() =>
                setIndex((index + warnings.length - 1) % warnings.length)
              }
            >
              <ChevronsLeft />
            </IconButton>
            <span aria-label="Warning count">
              {index + 1}/{warnings.length}
            </span>
            <IconButton
              label="Next warning"
              onClick={() => setIndex((index + 1) % warnings.length)}
            >
              <ChevronsRight />
            </IconButton>
          </>
        )}
        <IconButton
          label="Dismiss all warnings"
          onClick={() => setDismissed(true)}
        >
          <X />
        </IconButton>
      </div>
    </div>
  );
}
