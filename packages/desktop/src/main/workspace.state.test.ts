import { describe, expect, it } from "vitest";
import { createLayout, listPanes } from "@comma-agents/ui/workspace";
import type { LayoutState } from "@comma-agents/ui/workspace";
import {
  SavedWorkspaceSchema,
  transferChat,
  WorkspaceCommandSchema,
} from "./workspace.state";

const empty: LayoutState = {
  layout: {
    root: { type: "split", id: "empty", direction: "row", children: [] },
    activeId: "",
  },
  strategyChoices: {},
};

describe("transferChat", () => {
  it("should move the last chat and its selected strategy into another window", () => {
    const source: LayoutState = {
      layout: createLayout("/runs/active", () => "chat"),
      strategyChoices: { chat: "strategy.yaml" },
      maximizedId: "chat",
    };
    const result = transferChat(source, empty, "chat", "", "right")!;
    expect(listPanes(result.source.layout.root)).toEqual([]);
    expect(result.source.strategyChoices).toEqual({});
    expect(result.source.maximizedId).toBeUndefined();
    expect(result.target.layout).toEqual(source.layout);
    expect(result.target.strategyChoices).toEqual(source.strategyChoices);
    expect(listPanes(source.layout.root)).toHaveLength(1);
  });

  it("should return a chat at the selected drop zone", () => {
    const source: LayoutState = {
      layout: createLayout("/runs/x", () => "returned"),
      strategyChoices: {},
    };
    const target: LayoutState = {
      layout: createLayout("/", () => "existing"),
      strategyChoices: { existing: "existing.yaml" },
    };
    const result = transferChat(source, target, "returned", "existing", "top")!;
    expect(result.target.layout.root).toMatchObject({
      type: "split",
      direction: "column",
      children: [
        { id: "returned", path: "/runs/x" },
        { id: "existing", path: "/" },
      ],
    });
    expect(result.target.layout.activeId).toBe("returned");
    expect(result.target.strategyChoices).toEqual(target.strategyChoices);
  });

  it("should leave both windows alone when the destination no longer exists", () => {
    const source: LayoutState = {
      layout: createLayout("/", () => "source"),
      strategyChoices: {},
    };
    const target: LayoutState = {
      layout: createLayout("/", () => "target"),
      strategyChoices: {},
    };
    expect(
      transferChat(source, target, "source", "missing", "left"),
    ).toBeUndefined();
    expect(
      transferChat(source, target, "missing", "target", "left"),
    ).toBeUndefined();
  });
});

describe("SavedWorkspaceSchema", () => {
  it("should validate versioned project ownership and pane collections", () => {
    const state = {
      layout: createLayout("/runs/x", () => "chat"),
      strategyChoices: {},
      paneCollections: {
        chat: {
          paneId: "chat",
          chatIds: ["x"],
          selectedChatId: "x",
          closed: false,
        },
      },
    };
    const parsed = SavedWorkspaceSchema.parse({
      version: 2,
      clientWorkspaces: {
        activeProjectId: "general",
        workspaces: { general: { projectId: "general", state: empty } },
      },
      windows: [
        { id: "main", projectId: "general", state: empty },
        { id: "detached", projectId: "project", state },
      ],
    });
    expect(parsed.windows[1]?.projectId).toBe("project");
    expect(parsed.windows[1]?.state.paneCollections?.chat?.chatIds).toEqual([
      "x",
    ]);
  });

  it("should reject duplicate native ownership and unsupported saved versions", () => {
    const state = {
      layout: createLayout("/", () => "same"),
      strategyChoices: {},
    };
    const saved = {
      version: 2,
      clientWorkspaces: { activeProjectId: "general", workspaces: {} },
      windows: [
        { id: "main", projectId: "general", state },
        { id: "other", projectId: "general", state },
      ],
    };
    expect(SavedWorkspaceSchema.safeParse(saved).success).toBe(false);
    expect(
      SavedWorkspaceSchema.safeParse({ ...saved, version: 1 }).success,
    ).toBe(false);
    expect(
      SavedWorkspaceSchema.safeParse({
        ...saved,
        windows: saved.windows.slice(1),
      }).success,
    ).toBe(false);
  });
});

describe("WorkspaceCommandSchema", () => {
  it("should reject malformed IPC commands", () => {
    expect(
      WorkspaceCommandSchema.safeParse({
        type: "dock",
        targetId: "chat",
        zone: "center",
      }).success,
    ).toBe(false);
    expect(
      WorkspaceCommandSchema.safeParse({
        type: "layout",
        action: { type: "sizes", splitId: "split", sizes: [-1] },
      }).success,
    ).toBe(false);
    expect(
      WorkspaceCommandSchema.safeParse({
        type: "endDrag",
        paneId: "chat",
        x: Number.NaN,
        y: 0,
        cancelled: false,
      }).success,
    ).toBe(false);
  });
});
