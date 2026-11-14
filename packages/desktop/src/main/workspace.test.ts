import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { createLayout, listPanes } from "@comma-agents/ui/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  WorkspaceCommand,
  WorkspaceSnapshot,
} from "@comma-agents/ui/workspace";

const ipc = vi.hoisted(() => ({ on: vi.fn(), handle: vi.fn() }));
const factory = vi.hoisted(() => ({ create: vi.fn(), show: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: ipc }));
vi.mock("./window", () => ({
  createMainWindow: factory.create,
  showWindow: factory.show,
}));

const { createWorkspace } = await import("./workspace");

/**
 * Build the window surface used by the workspace coordinator.
 * @param {number} id - Renderer identity.
 * @returns {object} Fake window.
 */
function fakeWindow(id: number) {
  return {
    webContents: {
      id,
      send: vi.fn(),
      isLoading: () => false,
      once: vi.fn(),
      on: vi.fn(),
    },
    getBounds: vi.fn(() => ({ x: 10, y: 10, width: 1000, height: 800 })),
    getNormalBounds: () => ({ x: 10, y: 10, width: 1000, height: 800 }),
    isMaximized: () => false,
    isDestroyed: () => false,
    destroy: vi.fn(),
    hide: vi.fn(),
  };
}

/**
 * Look up an installed IPC handler.
 * @param {string} channel - IPC channel.
 * @param {boolean} invoke - Whether the channel uses invoke.
 * @returns {Function} Installed handler.
 */
function handler(channel: string, invoke = false) {
  const calls = invoke ? ipc.handle.mock.calls : ipc.on.mock.calls;
  return calls.find(([name]) => name === channel)![1] as (
    ...args: unknown[]
  ) => unknown;
}

/**
 * Identify a renderer without granting it control of another window.
 * @param {number} id - Renderer identity.
 * @param {boolean} trusted - Whether the sender is trusted.
 * @returns {object} Sender event.
 */
function event(id: number, trusted = true) {
  return {
    sender: { id },
    senderFrame: { url: trusted ? "app" : "untrusted" },
  };
}

/**
 * Send one window-owned operation.
 * @param {number} id - Sender identity.
 * @param {WorkspaceCommand} value - Operation.
 * @returns {void}
 */
function command(id: number, value: WorkspaceCommand) {
  handler(IPC_CHANNELS.workspaceCommand)(event(id), value);
}

/**
 * Read a window's authoritative layout.
 * @param {number} id - Sender identity.
 * @returns {WorkspaceSnapshot} Current state.
 */
function snapshot(id: number): WorkspaceSnapshot {
  return handler(
    IPC_CHANNELS.workspaceGet,
    true,
  )(event(id)) as WorkspaceSnapshot;
}

describe("desktop workspace", () => {
  let directory: string;
  let detached: ReturnType<typeof fakeWindow>;
  let options: Parameters<typeof createWorkspace>[0];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), "comma-workspace-"));
    detached = fakeWindow(2);
    factory.create.mockReset().mockReturnValue(detached);
    options = {
      stateFile: join(directory, "desktop.json"),
      isTrusted: (url) => url === "app",
      isQuitting: () => false,
    };
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    rmSync(directory, { recursive: true, force: true });
  });

  it("should keep the source chat until the destination renderer is ready", () => {
    const workspace = createWorkspace(options);
    workspace.attachMain(fakeWindow(1) as unknown as BrowserWindow, false);
    const paneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "strategy", paneId, path: "strategy.yaml" },
    });
    command(1, { type: "detach", paneId });
    expect(snapshot(1).state.layout.activeId).toBe(paneId);
    expect(snapshot(2).detached).toBe(true);
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    expect(snapshot(1).state.layout.activeId).toBe("");
    expect(snapshot(2).state.strategyChoices).toEqual({
      [paneId]: "strategy.yaml",
    });
    workspace.save();
    expect(
      JSON.parse(readFileSync(join(directory, "workspace.json"), "utf8"))
        .windows,
    ).toHaveLength(2);
  });

  it("should preserve the source when a detached renderer fails to load", () => {
    const workspace = createWorkspace(options);
    workspace.attachMain(fakeWindow(1) as unknown as BrowserWindow, false);
    const before = snapshot(1).state;
    command(1, { type: "detach", paneId: before.layout.activeId });
    detached.webContents.once.mock.calls.find(
      ([name]) => name === "did-fail-load",
    )![1]();
    expect(snapshot(1).state).toEqual(before);
    expect(detached.destroy).toHaveBeenCalledOnce();
  });

  it("should retain unfinished chats when closing a detached window", async () => {
    const workspace = createWorkspace(options);
    workspace.attachMain(fakeWindow(1) as unknown as BrowserWindow, false);
    const paneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "path", id: paneId, path: "/runs/working" },
    });
    command(1, { type: "detach", paneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, { type: "close" });
    expect(detached.destroy).toHaveBeenCalledOnce();
    expect(snapshot(1).state.paneCollections?.[paneId]).toMatchObject({
      chatIds: ["working"],
      closed: true,
    });
    command(1, {
      type: "revealChat",
      projectId: "general",
      paneId,
      runId: "working",
    });
    expect(listPanes(snapshot(1).state.layout.root)).toContainEqual({
      type: "pane",
      id: paneId,
      path: "/runs/working",
    });
  });

  it("should preserve all chats associated with a closed detached pane", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const paneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "path", id: paneId, path: "/runs/first" },
    });
    command(1, { type: "layout", action: { type: "newChat", id: paneId } });
    command(1, {
      type: "layout",
      action: { type: "path", id: paneId, path: "/runs/second" },
    });
    command(1, { type: "detach", paneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, { type: "close" });
    expect(snapshot(1).state.paneCollections?.[paneId]?.chatIds).toEqual([
      "first",
      "second",
    ]);
  });

  it("should return through a chosen drop zone without stopping the run", () => {
    const workspace = createWorkspace(options);
    workspace.attachMain(fakeWindow(1) as unknown as BrowserWindow, false);
    const paneId = snapshot(1).state.layout.activeId;
    command(1, { type: "detach", paneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(1, {
      type: "layout",
      action: { type: "newChat", id: "main-chat" },
    });
    const mainPaneId = snapshot(1).state.layout.activeId;
    command(2, { type: "return" });
    expect(snapshot(1).selectingDock).toBe(true);
    command(1, { type: "cancelDock" });
    expect(snapshot(1).selectingDock).toBe(false);
    expect(detached.destroy).not.toHaveBeenCalled();
    command(2, { type: "return" });
    command(1, { type: "dock", targetId: mainPaneId, zone: "bottom" });
    expect(snapshot(1).state.layout.root).toMatchObject({
      direction: "column",
      children: [{ id: mainPaneId }, { id: paneId }],
    });
    expect(detached.destroy).toHaveBeenCalledOnce();
  });

  it("should hide and restore all windows and restore their saved ownership", () => {
    const main = fakeWindow(1);
    const workspace = createWorkspace(options);
    workspace.attachMain(main as unknown as BrowserWindow, false);
    const paneId = snapshot(1).state.layout.activeId;
    command(1, { type: "detach", paneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    workspace.hideAll();
    expect(main.hide).toHaveBeenCalledOnce();
    expect(detached.hide).toHaveBeenCalledOnce();
    workspace.showAll();
    expect(factory.show).toHaveBeenCalledWith(detached);
    expect(factory.show).toHaveBeenCalledWith(main);
    workspace.save();
    ipc.on.mockClear();
    ipc.handle.mockClear();
    const restored = createWorkspace(options);
    restored.attachMain(main as unknown as BrowserWindow, true);
    expect(snapshot(1).state.layout.activeId).toBe("");
    expect(snapshot(2).state.layout.activeId).toBe(paneId);
    expect(factory.create.mock.calls.at(-1)![1].startHidden).toBe(true);
    expect(factory.create.mock.calls.at(-1)![1].placement).toEqual({
      x: 10,
      y: 10,
      width: 1000,
      height: 800,
      maximized: false,
    });
  });

  it("should ignore untrusted requests and cancelled tear-out drags", () => {
    const workspace = createWorkspace(options);
    workspace.attachMain(fakeWindow(1) as unknown as BrowserWindow, false);
    const paneId = snapshot(1).state.layout.activeId;
    handler(IPC_CHANNELS.workspaceCommand)(event(1, false), {
      type: "detach",
      paneId,
    });
    command(1, { type: "drag", paneId });
    command(1, { type: "endDrag", paneId, x: 2000, y: 100, cancelled: true });
    expect(factory.create).not.toHaveBeenCalled();
    command(1, { type: "drag", paneId });
    command(1, { type: "endDrag", paneId, x: 2000, y: 100, cancelled: false });
    expect(factory.create).toHaveBeenCalledOnce();
  });

  it("should wait for an in-flight submission before retaining and closing", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const paneId = snapshot(1).state.layout.activeId;
    command(1, { type: "busy", paneId, pending: true });
    command(1, { type: "detach", paneId });
    expect(factory.create).not.toHaveBeenCalled();
    command(1, { type: "busy", paneId, pending: false });
    command(1, { type: "detach", paneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, { type: "busy", paneId, pending: true });
    command(2, { type: "close" });
    expect(detached.destroy).not.toHaveBeenCalled();
    command(2, {
      type: "layout",
      action: { type: "path", id: paneId, path: "/runs/just-started" },
    });
    command(2, { type: "busy", paneId, pending: false });
    expect(detached.destroy).toHaveBeenCalledOnce();
    expect(snapshot(1).state.paneCollections?.[paneId]?.chatIds).toEqual([
      "just-started",
    ]);
  });

  it("should split, reorder, and restore multiple chats in a detached window", () => {
    const workspace = createWorkspace(options);
    const main = fakeWindow(1) as unknown as BrowserWindow;
    workspace.attachMain(main, false);
    const first = snapshot(1).state.layout.activeId;
    command(1, { type: "detach", paneId: first });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, {
      type: "layout",
      action: { type: "split", id: first, direction: "row" },
    });
    const second = snapshot(2).state.layout.activeId;
    command(2, { type: "drag", paneId: second });
    command(2, { type: "dock", targetId: first, zone: "bottom" });
    expect(snapshot(2).state.layout.root).toMatchObject({
      direction: "column",
      children: [{ id: first }, { id: second }],
    });
    const before = snapshot(2).state.layout;
    workspace.save();
    ipc.on.mockClear();
    ipc.handle.mockClear();
    createWorkspace(options).attachMain(main, false);
    expect(snapshot(2).state.layout).toEqual(before);
    expect(snapshot(2).detached).toBe(true);
  });

  it("should move individual chats between windows without discarding siblings", () => {
    const workspace = createWorkspace(options);
    workspace.attachMain(fakeWindow(1) as unknown as BrowserWindow, false);
    const first = snapshot(1).state.layout.activeId;
    command(1, { type: "detach", paneId: first });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, {
      type: "layout",
      action: { type: "split", id: first, direction: "row" },
    });
    const second = snapshot(2).state.layout.activeId;
    command(2, { type: "drag", paneId: first });
    command(1, { type: "dock", targetId: "", zone: "right" });
    expect(
      listPanes(snapshot(2).state.layout.root).map((pane) => pane.id),
    ).toEqual([second]);
    expect(detached.destroy).not.toHaveBeenCalled();
    command(2, { type: "drag", paneId: second });
    command(1, { type: "dock", targetId: first, zone: "left" });
    expect(
      listPanes(snapshot(1).state.layout.root).map((pane) => pane.id),
    ).toEqual([second, first]);
    expect(detached.destroy).toHaveBeenCalledOnce();
  });

  it("should pop out a split from a detached window and dock it into another detached window", () => {
    const workspace = createWorkspace(options);
    workspace.attachMain(fakeWindow(1) as unknown as BrowserWindow, false);
    const first = snapshot(1).state.layout.activeId;
    command(1, { type: "detach", paneId: first });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, {
      type: "layout",
      action: { type: "split", id: first, direction: "row" },
    });
    const second = snapshot(2).state.layout.activeId;
    const thirdWindow = fakeWindow(3);
    factory.create.mockReturnValueOnce(thirdWindow);
    command(2, { type: "detach", paneId: second });
    handler(IPC_CHANNELS.workspaceReady)(event(3));
    expect(listPanes(snapshot(2).state.layout.root)).toHaveLength(1);
    expect(snapshot(3).state.layout.activeId).toBe(second);
    expect(detached.destroy).not.toHaveBeenCalled();
    command(3, { type: "drag", paneId: second });
    command(2, { type: "dock", targetId: first, zone: "top" });
    expect(
      listPanes(snapshot(2).state.layout.root).map((pane) => pane.id),
    ).toEqual([second, first]);
    expect(thirdWindow.destroy).toHaveBeenCalledOnce();
    expect(detached.destroy).not.toHaveBeenCalled();
  });

  it("should retain all pane groups when closing a multi-pane detached window", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const first = snapshot(1).state.layout.activeId;
    command(1, { type: "detach", paneId: first });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, {
      type: "layout",
      action: { type: "split", id: first, direction: "row" },
    });
    const second = snapshot(2).state.layout.activeId;
    command(2, {
      type: "layout",
      action: { type: "path", id: first, path: "/runs/first" },
    });
    command(2, {
      type: "layout",
      action: { type: "path", id: second, path: "/runs/second" },
    });
    command(2, { type: "close" });
    expect(detached.destroy).toHaveBeenCalledOnce();
    expect(snapshot(1).state.paneCollections?.[first]?.closed).toBe(true);
    expect(snapshot(1).state.paneCollections?.[second]?.closed).toBe(true);
  });

  it("should close one detached pane while preserving its siblings and history", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const first = snapshot(1).state.layout.activeId;
    command(1, { type: "detach", paneId: first });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(2, {
      type: "layout",
      action: { type: "split", id: first, direction: "row" },
    });
    const second = snapshot(2).state.layout.activeId;
    command(2, {
      type: "layout",
      action: { type: "path", id: second, path: "/runs/second" },
    });
    command(2, { type: "layout", action: { type: "close", id: second } });
    expect(
      listPanes(snapshot(2).state.layout.root).map((pane) => pane.id),
    ).toEqual([first]);
    expect(snapshot(1).state.paneCollections?.[second]).toMatchObject({
      chatIds: ["second"],
      closed: true,
    });
    expect(detached.destroy).not.toHaveBeenCalled();
  });
  it("should hide inactive project windows and reveal the original pane on return", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const paneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "path", id: paneId, path: "/runs/background" },
    });
    command(1, { type: "detach", paneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(1, {
      type: "switchProject",
      projectId: "other",
      state: {
        layout: createLayout("/", () => "other-pane"),
        strategyChoices: {},
      },
    });
    expect(snapshot(1).projectId).toBe("other");
    expect(snapshot(2).projectId).toBe("general");
    expect(detached.hide).toHaveBeenCalledOnce();
    expect(
      snapshot(1).clientWorkspaces?.workspaces.general?.windowStates?.[0]
        ?.layout.activeId,
    ).toBe(paneId);
    const general = snapshot(1).clientWorkspaces!.workspaces.general!.state;
    command(1, { type: "switchProject", projectId: "general", state: general });
    command(1, {
      type: "revealChat",
      projectId: "general",
      paneId,
      runId: "background",
    });
    expect(snapshot(2).state.layout.activeId).toBe(paneId);
    expect(factory.show).toHaveBeenCalledWith(detached);
    expect(listPanes(snapshot(1).state.layout.root)).toHaveLength(0);
  });

  it("should move detached General work while preserving its archived pane records", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const paneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "path", id: paneId, path: "/runs/moved" },
    });
    command(1, { type: "detach", paneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    const destination = snapshot(1).clientWorkspaces!.workspaces.general!;
    const resetGeneral = {
      projectId: "general",
      state: {
        layout: createLayout("/", () => "fresh-general"),
        strategyChoices: {},
        paneCollections: {
          archived: { paneId: "archived", chatIds: ["old"], closed: true },
        },
      },
    };
    command(1, {
      type: "saveClientWorkspaces",
      value: {
        activeProjectId: "named",
        workspaces: {
          general: resetGeneral,
          named: { ...destination, projectId: "named" },
        },
      },
    });
    command(1, {
      type: "switchProject",
      projectId: "named",
      state: destination.state,
    });
    expect(snapshot(2).projectId).toBe("named");
    expect(snapshot(1).clientWorkspaces!.workspaces.general!.state).toEqual(
      resetGeneral.state,
    );
    expect(
      snapshot(1).clientWorkspaces!.workspaces.named!.state.paneCollections?.[
        paneId
      ]?.chatIds,
    ).toEqual(["moved"]);
  });

  it("should refuse workspace switches during an acknowledged submission", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const paneId = snapshot(1).state.layout.activeId;
    command(1, { type: "busy", paneId, pending: true });
    command(1, {
      type: "switchProject",
      projectId: "other",
      state: { layout: createLayout(), strategyChoices: {} },
    });
    expect(snapshot(1).projectId).toBe("general");
  });
  it("should start fresh in the matching detached pane without changing the focused main chat", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const detachedPaneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "path", id: detachedPaneId, path: "/runs/done" },
    });
    command(1, { type: "detach", paneId: detachedPaneId });
    handler(IPC_CHANNELS.workspaceReady)(event(2));
    command(1, {
      type: "layout",
      action: { type: "newChat", id: "main-chat" },
    });
    const mainPaneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "path", id: mainPaneId, path: "/runs/keep" },
    });
    command(1, {
      type: "newChatInPane",
      projectId: "general",
      paneId: detachedPaneId,
      runId: "done",
    });
    expect(listPanes(snapshot(2).state.layout.root)[0]?.path).toBe("/");
    expect(listPanes(snapshot(1).state.layout.root)[0]?.path).toBe(
      "/runs/keep",
    );
    expect(
      snapshot(2).state.paneCollections?.[detachedPaneId]?.chatIds,
    ).toEqual(["done"]);
    expect(
      snapshot(2).state.paneCollections?.[detachedPaneId]?.draftId,
    ).toBeTruthy();
    command(1, {
      type: "newChatInPane",
      projectId: "general",
      paneId: mainPaneId,
      runId: "other",
    });
    expect(listPanes(snapshot(1).state.layout.root)[0]?.path).toBe(
      "/runs/keep",
    );
  });
  it("should clear a closed chat from an inactive project's saved pane", () => {
    createWorkspace(options).attachMain(
      fakeWindow(1) as unknown as BrowserWindow,
      false,
    );
    const paneId = snapshot(1).state.layout.activeId;
    command(1, {
      type: "layout",
      action: { type: "path", id: paneId, path: "/runs/background" },
    });
    command(1, {
      type: "switchProject",
      projectId: "other",
      state: {
        layout: createLayout("/runs/current", () => "other-pane"),
        strategyChoices: {},
      },
    });
    command(1, {
      type: "newChatInPane",
      projectId: "general",
      paneId,
      runId: "background",
    });
    expect(snapshot(1).state.layout.root).toMatchObject({
      path: "/runs/current",
    });
    const general = snapshot(1).clientWorkspaces!.workspaces.general!.state;
    expect(general.layout.root).toMatchObject({ path: "/" });
    expect(general.paneCollections?.[paneId]?.chatIds).toEqual(["background"]);
  });
});
