import { useEffect, useMemo, useState } from "react";
import { listPanes } from "../useLayout/layout";
import type { Layout } from "../useLayout/layout.types";
import type { WorkspaceChat } from "./useWorkspaces.types";

const storageKey = "comma-agents.viewed-chats";

function loadViewedChats(): Readonly<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter((entry) => typeof entry[1] === "string"),
    );
  } catch {
    return {};
  }
}

/**
 * Remember finalized output viewed in a focused pane, independently of daemon state.
 * @param {readonly WorkspaceChat[]} chats - Live project catalog.
 * @param {Layout} layout - This window's current panes and focus.
 * @returns {readonly WorkspaceChat[]} Chats annotated with unread output.
 */
export function useViewedChats(
  chats: readonly WorkspaceChat[],
  layout: Layout,
): readonly WorkspaceChat[] {
  const [viewed, setViewed] = useState(loadViewedChats);
  useEffect(() => {
    const recordView = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        return;
      }
      const pane = listPanes(layout.root).find(
        (entry) => entry.id === layout.activeId,
      );
      const chat = chats.find((entry) => pane?.path === `/runs/${entry.runId}`);
      if (!chat?.latestEntryId || chat.attention.running) {
        return;
      }
      const latestEntryId = chat.latestEntryId;
      setViewed((previous) => {
        if (previous[chat.runId] === latestEntryId) {
          return previous;
        }
        const next = {
          ...loadViewedChats(),
          ...previous,
          [chat.runId]: latestEntryId,
        };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Keep read state in memory when storage is unavailable.
        }
        return next;
      });
    };
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setViewed(loadViewedChats());
      }
    };
    recordView();
    window.addEventListener("focus", recordView);
    document.addEventListener("visibilitychange", recordView);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", recordView);
      document.removeEventListener("visibilitychange", recordView);
      window.removeEventListener("storage", sync);
    };
  }, [chats, layout]);
  return useMemo(
    () =>
      chats.map((chat) => ({
        ...chat,
        unread: Boolean(
          chat.latestEntryId && viewed[chat.runId] !== chat.latestEntryId,
        ),
      })),
    [chats, viewed],
  );
}
