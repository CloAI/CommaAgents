import { useEffect, useState } from "react";
import { version } from "../../../../../package.json";
import { useDaemonChannel } from "../useDaemonChannel";
import { listPanes, useLayout } from "../useLayout";
import type { Layout } from "../useLayout";

/**
 * Name the application and focused run for window chrome.
 * @param {Layout} layout - The pane grid.
 * @param {string} [runName] - Resolved name of the focused run, when available.
 * @returns {string} The application version, followed by the focused run's name or short ID.
 */
export function focusedPaneTitle(layout: Layout, runName?: string): string {
  const focused = listPanes(layout.root).find(
    (pane) => pane.id === layout.activeId,
  );
  const runId = /^\/runs\/([^/]+)$/.exec(focused?.path ?? "/")?.[1];
  const name = runId ? runName || `Run ${runId.slice(0, 8)}` : undefined;
  return `CommaAgents v${version}${name ? ` - ${name}` : ""}`;
}

/**
 * Follow the application version and focused run's strategy name for window chrome.
 * @returns {string} The application title, with a run name when a run is focused.
 */
export function useFocusedPaneTitle(): string {
  const { layout } = useLayout();
  const focused = listPanes(layout.root).find(
    (pane) => pane.id === layout.activeId,
  );
  const runId = /^\/runs\/([^/]+)$/.exec(focused?.path ?? "/")?.[1];
  const [run, setRun] = useState<{
    readonly id: string;
    readonly name: string;
  }>();
  useDaemonChannel("runs", runId ? { runId } : undefined, (message) => {
    if (message.type === "run.state" && message.data.strategy) {
      setRun({ id: message.data.runId, name: message.data.strategy.name });
    }
  });
  const title = focusedPaneTitle(
    layout,
    run?.id === runId ? run?.name : undefined,
  );
  useEffect(() => {
    document.title = title;
  }, [title]);
  return title;
}
