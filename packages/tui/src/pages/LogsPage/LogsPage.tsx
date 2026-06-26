import { Box, Text } from "ink";
import type React from "react";
import { ScrollableView } from "../../components";
import { useDebugRender } from "../../hooks/useDebugRender";
import { type LogEntry, useLogs } from "../../hooks/useLogs";
import type { LogsPageTheme } from "./LogsPage.theme";
import { useLogsPageTheme } from "./LogsPage.theme";
import { formatLevel, formatTimestamp } from "./LogsPage.utils";

export function LogsPage(): React.ReactElement {
  const { logs, clearLogs } = useLogs();
  const debug = useDebugRender("LogsPage", {
    props: { logs, clearLogs },
  });
  const theme = useLogsPageTheme();

  return <LogsPageRender theme={theme} logs={logs} debugRef={debug.ref} />;
}

export interface LogsPageRenderProps {
  /** Resolved theme style objects. */
  readonly theme: LogsPageTheme;
  /** The log entries to display. */
  readonly logs: readonly LogEntry[];
  /** Debug render ref. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

export function LogsPageRender({
  theme,
  logs,
  debugRef,
}: LogsPageRenderProps): React.ReactElement {
  if (logs.length === 0) {
    return (
      <Box ref={debugRef} {...theme.root}>
        <Text {...theme.emptyState}>No logs captured yet.</Text>
      </Box>
    );
  }

  return (
    <Box ref={debugRef} {...theme.root}>
      <ScrollableView
        items={logs}
        getKey={(_entry, index) => `log_item-${index}`}
        renderItem={(entry, _index) => (
          <Box key={entry.id} {...theme.logRow}>
            <Text {...theme.timestamp}>{formatTimestamp(entry.timestamp)}</Text>
            <Text {...theme.levels[entry.level]}>
              {formatLevel(entry.level)}
            </Text>
            <Text {...theme.messageBody}>{entry.message}</Text>
          </Box>
        )}
      />
    </Box>
  );
}
