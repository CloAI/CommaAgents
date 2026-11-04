import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Check, Copy } from "lucide-react";
import styles from "./CodeBlock.module.scss";

const COPIED_DURATION_MS = 1500;

/** The code to show. */
export interface CodeBlockProps {
  /** Language named on the fence, shown in the header. */
  readonly language?: string;
  /** The `code` element holding the text, optionally with highlighted children. */
  readonly children: ReactNode;
}

/**
 * Show code with its language and a button that copies it.
 * @param {CodeBlockProps} props - Component properties.
 * @returns {React.ReactElement} The code block.
 */
export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeRef.current?.textContent ?? "");
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the button simply stays as it was.
    }
  }, []);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_DURATION_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <CodeBlockRender
      language={language}
      copied={copied}
      codeRef={codeRef}
      onCopy={handleCopy}
    >
      {children}
    </CodeBlockRender>
  );
}

/** Code and the state of its copy button. */
export interface CodeBlockRenderProps {
  /** Language named on the fence, shown in the header. */
  readonly language?: string;
  /** Whether the code was just copied. */
  readonly copied: boolean;
  /** Receives the element whose text is copied. */
  readonly codeRef: RefObject<HTMLPreElement | null>;
  /** Called when the copy button is pressed. */
  readonly onCopy: () => void;
  /** The `code` element holding the text. */
  readonly children: ReactNode;
}

/**
 * Print the header and the scrolling code.
 * @param {CodeBlockRenderProps} props - Component properties.
 * @returns {React.ReactElement} The code block.
 */
export function CodeBlockRender({
  language,
  copied,
  codeRef,
  onCopy,
  children,
}: CodeBlockRenderProps) {
  return (
    <div className={styles.codeBlock}>
      <div className={styles.header}>
        <span className={styles.language}>{language ?? "text"}</span>
        <button type="button" className={styles.copy} onClick={onCopy}>
          {copied ? (
            <Check size={14} aria-hidden />
          ) : (
            <Copy size={14} aria-hidden />
          )}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre ref={codeRef} className={styles.body} tabIndex={0}>
        {children}
      </pre>
    </div>
  );
}
