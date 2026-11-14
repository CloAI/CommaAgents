import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectPaneChats,
  copyWorkspaceState,
  decodeChat,
  displayedChatIds,
  getArchiveCandidates,
  remapWorkspacePanes,
} from "./useWorkspaces.utils";
import { listPanes } from "../useLayout/layout";
import type { LayoutState } from "../useLayout/useLayout.types";

const source: LayoutState = {
  layout: {
    root: {
      type: "split",
      id: "grid",
      direction: "row",
      sizes: [25, 75],
      children: [
        { type: "pane", id: "left", path: "/runs/running" },
        { type: "pane", id: "right", path: "/runs/other" },
      ],
    },
    activeId: "left",
  },
  strategyChoices: { left: "strategy-a" },
  paneCollections: {
    left: {
      paneId: "left",
      chatIds: ["previous", "running"],
      selectedChatId: "running",
      closed: false,
    },
    closed: { paneId: "closed", chatIds: ["hidden"], closed: true },
  },
};
describe("workspace presentation", () => {
  it("should protect displayed chats in inactive workspaces and detached windows without protecting old history", () => {
    const displayed = displayedChatIds(
      {
        activeProjectId: "general",
        workspaces: {
          saved: {
            projectId: "saved",
            state: source,
            windowStates: [
              {
                layout: {
                  root: {
                    type: "pane",
                    id: "detached",
                    path: "/runs/detached",
                  },
                  activeId: "detached",
                },
                strategyChoices: {},
              },
            ],
          },
        },
      },
      {
        layout: {
          root: { type: "pane", id: "current", path: "/runs/current" },
          activeId: "current",
        },
        strategyChoices: {},
      },
    );
    expect([...displayed].sort()).toEqual([
      "current",
      "detached",
      "other",
      "running",
    ]);
    expect(displayed.has("previous")).toBe(false);
  });
  it("should copy only selected checkpoint chats while retaining the grid and closed collection", () => {
    const copied = copyWorkspaceState(source, {
      running: "copy-running",
      hidden: "copy-hidden",
    });
    expect(listPanes(copied.layout.root).map((pane) => pane.path)).toEqual([
      "/runs/copy-running",
      "/",
    ]);
    expect(copied.paneCollections?.left?.chatIds).toEqual(["copy-running"]);
    expect(copied.paneCollections?.closed).toEqual({
      paneId: "closed",
      chatIds: ["copy-hidden"],
      selectedChatId: undefined,
      closed: true,
    });
    expect(
      copied.layout.root.type === "split" && copied.layout.root.sizes,
    ).toEqual([25, 75]);
  });
  it("should give independent named workspaces new identities and share remapping with detached windows", () => {
    const remapped = remapWorkspacePanes(source);
    expect(remapped.state.layout.activeId).not.toBe("left");
    expect(remapped.state.strategyChoices[remapped.paneIdMap.left!]).toBe(
      "strategy-a",
    );
    expect(
      remapped.state.paneCollections?.[remapped.paneIdMap.closed!]?.closed,
    ).toBe(true);
    const detached = remapWorkspacePanes(
      {
        ...source,
        layout: {
          root: { type: "pane", id: "closed", path: "/runs/hidden" },
          activeId: "closed",
        },
      },
      remapped.paneIdMap,
    );
    expect(detached.state.layout.activeId).toBe(remapped.paneIdMap.closed);
  });
  it("should discover displayed run paths while preserving existing history", () => {
    const collected = collectPaneChats(source);
    expect(collected.paneCollections?.left?.chatIds).toEqual([
      "previous",
      "running",
    ]);
    expect(collected.paneCollections?.right?.chatIds).toEqual(["other"]);
    expect(collected.paneCollections?.closed?.closed).toBe(true);
  });
  it("should decode ISO dates into Date objects at the protocol boundary", () => {
    const chat = decodeChat({
      runId: "chat",
      projectId: "general",
      title: "Chat",
      lastActivityAt: "2026-11-13T12:00:00.000Z",
      archivedAt: "2026-11-13T13:00:00.000Z",
      attention: {
        running: false,
        question: false,
        permission: false,
        failed: false,
      },
    });
    expect(chat.lastActivityAt).toBeInstanceOf(Date);
    expect(chat.archivedAt?.getTime()).toBeGreaterThan(
      chat.lastActivityAt.getTime(),
    );
  });
});

describe("automatic archive retention", () => {
  afterEach(() => vi.useRealTimers());
  it("should archive stale idle chats while protecting active prompts and every saved displayed chat", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
    const idle = {
      running: false,
      question: false,
      permission: false,
      failed: false,
    };
    const base = {
      projectId: "general",
      title: "Chat",
      lastActivityAt: new Date("2026-11-01T00:00:00.000Z"),
      attention: idle,
    };
    const chats = [
      { ...base, runId: "stale" },
      { ...base, runId: "running", attention: { ...idle, running: true } },
      { ...base, runId: "question", attention: { ...idle, question: true } },
      {
        ...base,
        runId: "permission",
        attention: { ...idle, permission: true },
      },
      {
        ...base,
        runId: "recently-viewed",
        lastActivityAt: new Date("2026-11-12T00:00:00.000Z"),
      },
      {
        ...base,
        runId: "already-archived",
        archivedAt: new Date("2026-11-02T00:00:00.000Z"),
      },
      { ...base, runId: "other" },
      { ...base, runId: "detached" },
    ];
    const store = {
      activeProjectId: "general",
      workspaces: {
        inactive: {
          projectId: "inactive",
          state: source,
          windowStates: [
            {
              layout: {
                root: {
                  type: "pane" as const,
                  id: "window",
                  path: "/runs/detached",
                },
                activeId: "window",
              },
              strategyChoices: {},
            },
          ],
        },
      },
    };
    expect(getArchiveCandidates(chats, store, source)).toEqual(["stale"]);
    const resetActivity = chats.map((chat) =>
      chat.runId === "stale" ? { ...chat, lastActivityAt: new Date() } : chat,
    );
    expect(getArchiveCandidates(resetActivity, store, source)).toEqual([]);
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);
    expect(getArchiveCandidates(resetActivity, store, source)).toContain(
      "stale",
    );
  });
});
