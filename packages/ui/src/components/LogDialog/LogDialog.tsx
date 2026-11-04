import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "../../design-system/Button";
import { Input } from "../../design-system/Input";
import { Modal } from "../../design-system/Modal";
import { formatLogEntries, useLogBucket } from "../../hooks/useLogBucket";
import type { LogBucket, LogEntry, LogLevel } from "../../hooks/useLogBucket";
import styles from "./LogDialog.module.scss";

/** Live diagnostic viewer for an explicitly owned log bucket. */
export interface LogDialogProps {
  /** Bucket whose complete history can be copied or cleared. */
  readonly bucket: LogBucket;
  /** Accessible modal title. */
  readonly title: string;
  /** Close the viewer; unmount to reset search and filtering. */
  readonly onClose: () => void;
}

/**
 * Display live bucket history with search, severity filtering, copying, and clearing.
 * @param {LogDialogProps} props - Bucket and modal controls.
 * @returns {React.ReactElement} The live diagnostic modal.
 */
export function LogDialog({ bucket, title, onClose }: LogDialogProps) {
  const [copyFeedback, setCopyFeedback] = useState("");
  const entries = useLogBucket(bucket);
  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        formatLogEntries(bucket.getSnapshot()),
      );
      setCopyFeedback("Copied all logs.");
    } catch {
      setCopyFeedback(
        "Could not copy logs. Select the log text to copy it manually.",
      );
    }
  }, [bucket]);
  return (
    <LogDialogRender
      title={title}
      entries={entries}
      onClose={onClose}
      onClear={bucket.clear}
      onCopy={copyAll}
      copyFeedback={copyFeedback}
    />
  );
}

/** Presentation and scrolling options for the diagnostic viewer. */
export interface LogDialogRenderProps {
  /** Accessible modal title. */
  readonly title: string;
  /** Chronological retained history. */
  readonly entries: readonly LogEntry[];
  /** Request dismissal. */
  readonly onClose: () => void;
  /** Clear the entire bucket, including filtered-out entries. */
  readonly onClear: () => void;
  /** Copy the entire bucket, including filtered-out entries. */
  readonly onCopy: () => void;
  /** Result of the most recent copy attempt. */
  readonly copyFeedback: string;
}

/**
 * Render a compact log viewer; follow new entries only while at the bottom.
 * @param {LogDialogRenderProps} props - History and diagnostic actions.
 * @returns {React.ReactElement} The searchable log presentation.
 */
export function LogDialogRender({
  title,
  entries,
  onClose,
  onClear,
  onCopy,
  copyFeedback,
}: LogDialogRenderProps) {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const scrollRef = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  const query = search.toLowerCase();
  const visible = entries.filter(
    (entry) =>
      (level === "all" || entry.level === level) &&
      `${entry.message}\n${entry.details ?? ""}`.toLowerCase().includes(query),
  );

  useLayoutEffect(() => {
    following.current = true;
  }, [search, level]);
  useEffect(() => {
    const element = scrollRef.current;
    if (element && following.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [entries, search, level]);

  return (
    <Modal open title={title} onClose={onClose} className={styles.modal}>
      <div className={styles.content}>
        <div className={styles.toolbar}>
          <Input
            aria-label="Search logs"
            placeholder="Search logs"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={styles.search}
          />
          <select
            aria-label="Log level"
            className={styles.level}
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as LogLevel | "all")
            }
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <Button onClick={onCopy} disabled={entries.length === 0}>
            Copy all
          </Button>
          <Button onClick={onClear} disabled={entries.length === 0}>
            Clear
          </Button>
        </div>
        <div className={styles.summary}>
          <span>
            {visible.length} / {entries.length} entries
          </span>
          <span role="status">{copyFeedback}</span>
        </div>
        <pre
          ref={scrollRef}
          className={styles.logs}
          tabIndex={0}
          aria-label="Log entries"
          onScroll={(event) => {
            const element = event.currentTarget;
            following.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <=
              2;
          }}
        >
          {entries.length === 0
            ? "No logs yet."
            : visible.length === 0
              ? "No matching logs."
              : formatLogEntries(visible)}
        </pre>
      </div>
    </Modal>
  );
}
