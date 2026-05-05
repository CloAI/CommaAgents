import { Box, Text } from "ink";
import type React from "react";

import type { LogEntry } from "../../hooks/useLogs";
import { useDebugRender } from "../../hooks/useDebugRender";
import type { LogsPageTheme } from "./LogsPage.theme";
import { useLogsPageTheme } from "./LogsPage.theme";
import { formatLevel, formatTimestamp } from "./LogsPage.utils";

export interface LogsPageProps {
  /** The log entries to display. */
  readonly logs: readonly LogEntry[];
  /** Callback to clear all logs. */
  readonly onClear: () => void;
  /** Max visible log entries (scrolls to bottom). @default 100 */
  readonly maxVisible?: number;
}

export function LogsPage({ logs, onClear, maxVisible = 100 }: LogsPageProps): React.ReactElement {
  const debug = useDebugRender("LogsPage", { props: { logs, onClear, maxVisible } });
  const theme = useLogsPageTheme();

  return <LogsPageRender theme={theme} logs={logs} maxVisible={maxVisible} debugRef={debug.ref} />;
}

export interface LogsPageRenderProps {
  /** Resolved theme style objects. */
  readonly theme: LogsPageTheme;
  /** The log entries to display. */
  readonly logs: readonly LogEntry[];
  /** Max visible log entries (scrolls to bottom). */
  readonly maxVisible: number;
  /** Debug render ref. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

export function LogsPageRender({
  theme,
  logs,
  maxVisible,
  debugRef,
}: LogsPageRenderProps): React.ReactElement {
  const visible = logs.slice(-maxVisible);

  if (visible.length === 0) {
    return (
      <Box ref={debugRef} {...theme.root}>
        <Text {...theme.emptyState}>No logs captured yet.</Text>
      </Box>
    );
  }

  return (
    <Box ref={debugRef} {...theme.root}>
      {visible.map((entry) => (
        <Box key={entry.id} {...theme.logRow}>
          <Text {...theme.timestamp}>{formatTimestamp(entry.timestamp)}</Text>
          <Text {...theme.levels[entry.level]}>{formatLevel(entry.level)}</Text>
          <Text {...theme.messageBody}>{entry.message}</Text>
        </Box>
      ))}
    </Box>
  );
}
