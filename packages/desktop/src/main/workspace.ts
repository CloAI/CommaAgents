import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import {
  createLayout,
  extractPane,
  layoutReducer,
  listPanes,
} from "@comma-agents/ui/workspace";
import type {
  ClientWorkspaceStore,
  LayoutState,
  WorkspaceSnapshot,
} from "@comma-agents/ui/workspace";
import { IPC_CHANNELS } from "../shared/ipc";
import type { WindowState } from "./desktop-config";
import { createMainWindow, showWindow } from "./window";
import {
  SavedWorkspaceSchema,
  transferChat,
  WorkspaceCommandSchema,
} from "./workspace.state";

interface WorkspaceWindow {
  projectId: string;
  pendingSubmissions?: Set<string>;
  closeAfterSubmit?: { readonly paneId?: string };
  state: LayoutState;
  window?: BrowserWindow;
  placement?: WindowState;
  closeError?: string;
  failedClosePaneId?: string;
  closing?: boolean;
  pendingSource?: string;
  readyTimer?: ReturnType<typeof setTimeout>;
}

/** Desktop services needed to manage chat windows. */
interface WorkspaceOptions {
  readonly stateFile: string;
  readonly isTrusted: (url: string | undefined) => boolean;
  readonly isQuitting: () => boolean;
}

/**
 * Own pane placement, renderer synchronization, and detached window lifetimes.
 * @param {WorkspaceOptions} options - Desktop persistence, trust, and daemon services.
 * @returns {object} Workspace lifecycle controls.
 * @example
 * const workspace = createWorkspace({ stateFile, isTrusted, isQuitting });
 * workspace.attachMain(mainWindow, false);
 */
export function createWorkspace(options: WorkspaceOptions) {
  const { stateFile, isTrusted, isQuitting } = options;
  const file = join(dirname(stateFile), "workspace.json");
  const windows = new Map<string, WorkspaceWindow>();
  let clientWorkspaces: ClientWorkspaceStore = {
    activeProjectId: "general",
    workspaces: {},
  };
  let pendingClientWorkspaces: ClientWorkspaceStore | undefined;
  let draggingId: string | undefined;
  let returningId: string | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const saved = SavedWorkspaceSchema.parse(
      JSON.parse(readFileSync(file, "utf8")),
    );
    clientWorkspaces = saved.clientWorkspaces;
    for (const entry of saved.windows) {
      windows.set(entry.id, {
        projectId: entry.projectId,
        state: entry.state,
        placement: entry.placement,
      });
    }
  } catch {
    windows.set("main", {
      projectId: "general",
      state: { layout: createLayout(), strategyChoices: {} },
    });
  }

  const collectWorkspaces = (): ClientWorkspaceStore => {
    const records = { ...clientWorkspaces.workspaces };
    const mainWindow = windows.get("main")!;
    const projectIds = new Set([
      ...Object.keys(records),
      ...[...windows.values()].map((entry) => entry.projectId),
    ]);
    for (const projectId of projectIds) {
      const ownedWindows = [...windows.entries()].filter(
        ([, entry]) => entry.projectId === projectId && !entry.pendingSource,
      );
      const mainState =
        mainWindow.projectId === projectId
          ? mainWindow.state
          : records[projectId]?.state;
      if (!mainState) {
        continue;
      }
      const paneCollections = { ...mainState.paneCollections };
      const strategyChoices = { ...mainState.strategyChoices };
      for (const [, entry] of ownedWindows) {
        Object.assign(paneCollections, entry.state.paneCollections);
        Object.assign(strategyChoices, entry.state.strategyChoices);
      }
      records[projectId] = {
        projectId,
        state: { ...mainState, paneCollections, strategyChoices },
        windowStates: ownedWindows
          .filter(([id]) => id !== "main")
          .map(([, entry]) => entry.state),
      };
    }
    return { activeProjectId: mainWindow.projectId, workspaces: records };
  };

  const snapshot = (id: string, entry: WorkspaceWindow): WorkspaceSnapshot => ({
    state: {
      ...entry.state,
      draggingId: draggingId ?? (id === "main" ? returningId : undefined),
    },
    projectId: entry.projectId,
    submissionPending: [...windows.values()].some((owned) =>
      Boolean(owned.pendingSubmissions?.size),
    ),
    clientWorkspaces: collectWorkspaces(),
    detached: id !== "main",
    selectingDock: id === "main" && returningId !== undefined,
    closeError: entry.closeError,
    closing: entry.closing,
  });
  const persist = () => {
    clearTimeout(saveTimer);
    try {
      mkdirSync(dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      writeFileSync(
        temporary,
        JSON.stringify({
          version: 2,
          clientWorkspaces: collectWorkspaces(),
          windows: [...windows]
            .filter(([, entry]) => !entry.pendingSource)
            .map(([id, entry]) => ({
              id,
              projectId: entry.projectId,
              state: entry.state,
              placement: entry.placement,
            })),
        }),
      );
      renameSync(temporary, file);
    } catch (error) {
      console.error("Could not save desktop workspace", error);
    }
  };
  const publish = () => {
    clientWorkspaces = collectWorkspaces();
    for (const [id, entry] of windows) {
      if (entry.window && !entry.window.isDestroyed()) {
        entry.window.webContents.send(
          IPC_CHANNELS.workspaceChanged,
          snapshot(id, entry),
        );
      }
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 150);
  };
  const owner = (paneId: string, projectId = windows.get("main")!.projectId) =>
    [...windows].find(
      ([, entry]) =>
        !entry.pendingSource &&
        entry.projectId === projectId &&
        listPanes(entry.state.layout.root).some((pane) => pane.id === paneId),
    );
  const sender = (webContentsId: number) =>
    [...windows].find(
      ([, entry]) => entry.window?.webContents.id === webContentsId,
    );

  const discard = (id: string) => {
    const entry = windows.get(id);
    if (!entry) {
      return;
    }
    clearTimeout(entry.readyTimer);
    windows.delete(id);
    if (
      listPanes(entry.state.layout.root).some(
        (pane) => pane.id === returningId || pane.id === draggingId,
      )
    ) {
      returningId = undefined;
      draggingId = undefined;
    }
    entry.window?.destroy();
    publish();
    persist();
  };
  const closeDetached = async (id: string, paneId?: string) => {
    const entry = windows.get(id);
    if (!entry) {
      return;
    }
    if (entry.pendingSubmissions?.size) {
      entry.closeAfterSubmit = { paneId };
      return;
    }
    if (entry.pendingSource) {
      discard(id);
      return;
    }
    const closingPanes = listPanes(entry.state.layout.root).filter(
      (pane) => !paneId || pane.id === paneId,
    );
    const mainWindow = windows.get("main")!;
    const record = collectWorkspaces().workspaces[entry.projectId];
    const retained = { ...(record?.state.paneCollections ?? {}) };
    for (const pane of closingPanes) {
      const runId = /^\/runs\/([^/]+)$/.exec(pane.path)?.[1];
      const collection = entry.state.paneCollections?.[pane.id];
      retained[pane.id] = {
        paneId: pane.id,
        chatIds: collection?.chatIds ?? (runId ? [runId] : []),
        selectedChatId: collection?.selectedChatId ?? runId,
        closed: true,
      };
    }
    if (mainWindow.projectId === entry.projectId) {
      mainWindow.state = { ...mainWindow.state, paneCollections: retained };
    } else if (record) {
      clientWorkspaces = {
        ...clientWorkspaces,
        workspaces: {
          ...clientWorkspaces.workspaces,
          [entry.projectId]: {
            ...record,
            state: { ...record.state, paneCollections: retained },
          },
        },
      };
    }
    if (paneId && listPanes(entry.state.layout.root).length > 1) {
      entry.state = layoutReducer(entry.state, { type: "close", id: paneId });
      publish();
    } else {
      discard(id);
    }
  };

  const openDetached = (id: string, startHidden: boolean) => {
    const entry = windows.get(id)!;
    const created = createMainWindow(stateFile, {
      startHidden,
      placement: entry.placement ?? {
        width: 800,
        height: 700,
        maximized: false,
      },
      onPlacementChange: (placement) => {
        entry.placement = placement;
        publish();
      },
      onVisibilityChange: () => {},
      onClose: (event) => {
        if (isQuitting()) {
          return;
        }
        event.preventDefault();
        void closeDetached(id);
      },
    });
    entry.window = created;
    const failed = () => {
      if (entry.pendingSource) {
        discard(id);
      }
    };
    created.webContents.once("did-fail-load", failed);
    created.webContents.on("render-process-gone", failed);
    return created;
  };

  const dock = (
    paneId: string,
    targetId: string,
    zone: "left" | "right" | "top" | "bottom",
    destinationId = "main",
  ) => {
    const source = owner(paneId);
    const target = windows.get(destinationId);
    if (
      !source ||
      !target ||
      source[1].projectId !== target.projectId ||
      target.closing ||
      source[1].closing ||
      source[1].pendingSubmissions?.has(paneId) ||
      !target.window ||
      target.window.isDestroyed() ||
      target.window.webContents.isLoading()
    ) {
      return;
    }
    if (source[0] === destinationId) {
      target.state = layoutReducer(target.state, {
        type: "move",
        sourceId: paneId,
        targetId,
        zone,
      });
    } else {
      const transferred = transferChat(
        source[1].state,
        target.state,
        paneId,
        targetId,
        zone,
      );
      if (!transferred) {
        return;
      }
      target.state = transferred.target;
      source[1].state = transferred.source;
      if (
        source[0] !== "main" &&
        listPanes(transferred.source.layout.root).length === 0
      ) {
        discard(source[0]);
      }
    }
    draggingId = undefined;
    returningId = undefined;
    publish();
    showWindow(target.window);
  };

  const detach = (sourceId: string, paneId: string, x?: number, y?: number) => {
    if ([...windows.values()].some((entry) => entry.pendingSource === paneId)) {
      return;
    }
    const source = windows.get(sourceId)!;
    if (
      source.pendingSubmissions?.has(paneId) ||
      (sourceId !== "main" && listPanes(source.state.layout.root).length <= 1)
    ) {
      return;
    }
    const pane = listPanes(source.state.layout.root).find(
      (candidate) => candidate.id === paneId,
    );
    if (!pane) {
      return;
    }
    const id = crypto.randomUUID();
    windows.set(id, {
      projectId: source.projectId,
      state: {
        layout: { root: pane, activeId: pane.id },
        strategyChoices: source.state.strategyChoices,
        paneCollections: source.state.paneCollections?.[paneId]
          ? { [paneId]: source.state.paneCollections[paneId] }
          : {},
      },
      placement: { x, y, width: 800, height: 700, maximized: false },
      pendingSource: paneId,
    });
    try {
      openDetached(id, false);
      windows.get(id)!.readyTimer = setTimeout(() => discard(id), 20_000);
    } catch {
      discard(id);
    }
  };

  ipcMain.handle(IPC_CHANNELS.workspaceGet, (event) => {
    if (!isTrusted(event.senderFrame?.url)) {
      throw new Error("Untrusted workspace sender");
    }
    const found = sender(event.sender.id);
    if (!found) {
      throw new Error("Unknown workspace window");
    }
    return snapshot(...found);
  });
  ipcMain.on(IPC_CHANNELS.workspaceReady, (event) => {
    if (!isTrusted(event.senderFrame?.url)) {
      return;
    }
    const found = sender(event.sender.id);
    if (!found?.[1].pendingSource) {
      return;
    }
    const [id, entry] = found;
    const paneId = entry.pendingSource;
    if (!paneId) {
      return;
    }
    const source = owner(paneId);
    if (!source || source[1].pendingSubmissions?.has(paneId)) {
      discard(id);
      return;
    }
    const empty: LayoutState = {
      layout: {
        root: {
          type: "split",
          id: crypto.randomUUID(),
          direction: "row",
          children: [],
        },
        activeId: "",
      },
      strategyChoices: {},
    };
    const transferred = transferChat(
      source[1].state,
      empty,
      paneId,
      "",
      "right",
    );
    if (!transferred) {
      discard(id);
      return;
    }
    source[1].state = transferred.source;
    entry.state = transferred.target;
    entry.pendingSource = undefined;
    clearTimeout(entry.readyTimer);
    if (
      source[0] !== "main" &&
      listPanes(transferred.source.layout.root).length === 0
    ) {
      discard(source[0]);
    }
    publish();
    persist();
  });
  ipcMain.on(IPC_CHANNELS.workspaceCommand, (event, payload: unknown) => {
    if (!isTrusted(event.senderFrame?.url) || isQuitting()) {
      return;
    }
    const found = sender(event.sender.id);
    const parsed = WorkspaceCommandSchema.safeParse(payload);
    if (
      !found ||
      !parsed.success ||
      found[1].closing ||
      found[1].pendingSource
    ) {
      return;
    }
    const [id, entry] = found;
    const command = parsed.data;
    switch (command.type) {
      case "saveClientWorkspaces": {
        if (id !== "main") {
          return;
        }
        pendingClientWorkspaces = command.value;
        return;
      }
      case "switchProject": {
        if (
          id !== "main" ||
          [...windows.values()].some(
            (owned) => owned.pendingSubmissions?.size || owned.pendingSource,
          )
        ) {
          return;
        }
        const previousProjectId = entry.projectId;
        const previousStore = collectWorkspaces();
        const requestedStore = pendingClientWorkspaces ?? previousStore;
        pendingClientWorkspaces = undefined;
        const requestedGeneral = requestedStore.workspaces.general;
        clientWorkspaces = {
          ...previousStore,
          workspaces: {
            ...previousStore.workspaces,
            ...requestedStore.workspaces,
          },
        };
        // General's current work is moved, including native detached panes.
        const destinationPaneIds = new Set(
          Object.keys(command.state.paneCollections ?? {}),
        );
        for (const [windowId, owned] of windows) {
          if (windowId === "main") {
            continue;
          }
          if (
            owned.projectId === previousProjectId &&
            previousProjectId !== "general"
          ) {
            const ownedPaneIds = new Set(
              listPanes(owned.state.layout.root).map((pane) => pane.id),
            );
            const updatedState = requestedStore.workspaces[
              previousProjectId
            ]?.windowStates?.find((state) =>
              listPanes(state.layout.root).some((pane) =>
                ownedPaneIds.has(pane.id),
              ),
            );
            if (updatedState) {
              owned.state = updatedState;
            }
          }
          if (
            previousProjectId === "general" &&
            owned.projectId === "general" &&
            listPanes(owned.state.layout.root).some((pane) =>
              destinationPaneIds.has(pane.id),
            )
          ) {
            owned.projectId = command.projectId;
          }
          if (owned.projectId === previousProjectId) {
            owned.window?.hide();
          }
        }
        entry.projectId = command.projectId;
        const savedDetached =
          clientWorkspaces.workspaces[command.projectId]?.windowStates ?? [];
        for (const savedState of savedDetached) {
          const savedPanes = listPanes(savedState.layout.root);
          if (!savedPanes.length || savedPanes.some((pane) => owner(pane.id))) {
            continue;
          }
          const windowId = crypto.randomUUID();
          windows.set(windowId, {
            projectId: command.projectId,
            state: savedState,
          });
          openDetached(windowId, false);
        }
        const detachedPaneIds = new Set(
          [...windows.entries()]
            .filter(
              ([windowId, owned]) =>
                windowId !== "main" && owned.projectId === command.projectId,
            )
            .flatMap(([, owned]) =>
              listPanes(owned.state.layout.root).map((pane) => pane.id),
            ),
        );
        let nextState = command.state;
        for (const paneId of detachedPaneIds) {
          nextState = {
            ...nextState,
            layout: extractPane(nextState.layout, paneId),
          };
        }
        entry.state = nextState;
        if (
          previousProjectId === "general" &&
          command.projectId !== "general" &&
          [
            ...Object.keys(
              previousStore.workspaces.general?.state.paneCollections ?? {},
            ),
            ...listPanes(
              previousStore.workspaces.general?.state.layout.root ??
                entry.state.layout.root,
            ).map((pane) => pane.id),
          ].some((paneId) => destinationPaneIds.has(paneId))
        ) {
          clientWorkspaces = {
            ...clientWorkspaces,
            workspaces: {
              ...clientWorkspaces.workspaces,
              general:
                requestedGeneral &&
                !listPanes(requestedGeneral.state.layout.root).some((pane) =>
                  destinationPaneIds.has(pane.id),
                )
                  ? requestedGeneral
                  : {
                      projectId: "general",
                      state: {
                        layout: createLayout(),
                        strategyChoices: {},
                        paneCollections: {},
                      },
                    },
            },
          };
        }
        draggingId = undefined;
        returningId = undefined;
        for (const [windowId, owned] of windows) {
          if (
            windowId !== "main" &&
            owned.projectId === command.projectId &&
            owned.window
          ) {
            showWindow(owned.window);
          }
        }
        break;
      }
      case "newChatInPane": {
        if (id !== "main" && command.projectId !== entry.projectId) {
          return;
        }
        const destination = owner(command.paneId, command.projectId);
        const pane =
          destination &&
          listPanes(destination[1].state.layout.root).find(
            (candidate) => candidate.id === command.paneId,
          );
        if (pane?.path === `/runs/${command.runId}` && destination) {
          destination[1].state = layoutReducer(destination[1].state, {
            type: "path",
            id: pane.id,
            path: "/",
          });
        } else if (!destination && id === "main") {
          const record = clientWorkspaces.workspaces[command.projectId];
          const savedPane =
            record &&
            listPanes(record.state.layout.root).find(
              (candidate) => candidate.id === command.paneId,
            );
          if (savedPane?.path === `/runs/${command.runId}` && record) {
            clientWorkspaces = {
              ...clientWorkspaces,
              workspaces: {
                ...clientWorkspaces.workspaces,
                [command.projectId]: {
                  ...record,
                  state: layoutReducer(record.state, {
                    type: "path",
                    id: savedPane.id,
                    path: "/",
                  }),
                },
              },
            };
          }
        }
        break;
      }
      case "revealChat": {
        if (id !== "main" || command.projectId !== entry.projectId) {
          return;
        }
        const destination = owner(command.paneId, command.projectId);
        if (destination && destination[1].projectId === command.projectId) {
          destination[1].state = layoutReducer(destination[1].state, {
            type: "restore",
            paneId: command.paneId,
            runId: command.runId,
          });
          if (destination[1].window) {
            showWindow(destination[1].window);
          }
        } else {
          entry.state = layoutReducer(entry.state, {
            type: "restore",
            paneId: command.paneId,
            runId: command.runId,
          });
        }
        break;
      }
      case "busy": {
        if (owner(command.paneId, entry.projectId)?.[0] !== id) {
          return;
        }
        entry.pendingSubmissions ??= new Set();
        if (command.pending) {
          entry.pendingSubmissions.add(command.paneId);
        } else {
          entry.pendingSubmissions.delete(command.paneId);
          if (entry.closeAfterSubmit) {
            const pendingClose = entry.closeAfterSubmit;
            entry.closeAfterSubmit = undefined;
            void closeDetached(id, pendingClose.paneId);
          }
        }
        break;
      }
      case "layout": {
        const action = command.action;
        if (
          action.type === "newChat" &&
          entry.pendingSubmissions?.has(entry.state.layout.activeId)
        ) {
          return;
        }
        if (id !== "main" && action.type === "close") {
          if (listPanes(entry.state.layout.root).length > 1) {
            void closeDetached(id, action.id);
          }
          return;
        }
        const next = layoutReducer(
          entry.state,
          action.type === "drag" ? { type: "drag", id: action.id } : action,
        );
        if (next === entry.state) {
          return;
        }
        entry.state = next;
        break;
      }
      case "detach":
        detach(id, command.paneId, command.x, command.y);
        break;
      case "close": {
        if (id !== "main") {
          void closeDetached(id, entry.failedClosePaneId);
        }
        break;
      }
      case "return": {
        if (id === "main") {
          return;
        }
        returningId = entry.state.layout.activeId;
        const main = windows.get("main")!;
        if (listPanes(main.state.layout.root).length === 0 && returningId) {
          dock(returningId, "", "right");
        }
        if (main.window) {
          showWindow(main.window);
        }
        break;
      }
      case "dock": {
        const paneId = draggingId ?? (id === "main" ? returningId : undefined);
        if (paneId) {
          dock(paneId, command.targetId, command.zone, id);
        }
        break;
      }
      case "cancelDock":
        returningId = undefined;
        draggingId = undefined;
        break;
      case "drag":
        if (
          command.paneId &&
          owner(command.paneId, entry.projectId)?.[0] !== id
        ) {
          return;
        }
        draggingId = command.paneId;
        returningId = undefined;
        break;
      case "endDrag": {
        const owned = owner(command.paneId, entry.projectId)?.[0] === id;
        if (
          owned &&
          draggingId === command.paneId &&
          !command.cancelled &&
          entry.window
        ) {
          const bounds = entry.window.getBounds();
          if (
            command.x < bounds.x ||
            command.y < bounds.y ||
            command.x >= bounds.x + bounds.width ||
            command.y >= bounds.y + bounds.height
          ) {
            detach(id, command.paneId, command.x, command.y);
          }
        }
        draggingId = undefined;
        break;
      }
    }
    publish();
  });

  return {
    attachMain(window: BrowserWindow, startHidden: boolean) {
      windows.get("main")!.window = window;
      for (const id of windows.keys()) {
        if (id !== "main") {
          openDetached(
            id,
            startHidden ||
              windows.get(id)!.projectId !== windows.get("main")!.projectId,
          );
        }
      }
    },
    hideAll() {
      for (const entry of windows.values()) {
        entry.window?.hide();
      }
    },
    showAll() {
      for (const entry of windows.values()) {
        if (
          entry.projectId === windows.get("main")!.projectId &&
          entry.window &&
          !entry.window.isDestroyed()
        ) {
          showWindow(entry.window);
        }
      }
      const main = windows.get("main")?.window;
      if (main) {
        showWindow(main);
      }
    },
    save() {
      for (const [id, entry] of windows) {
        if (id !== "main" && entry.window && !entry.window.isDestroyed()) {
          const maximized = entry.window.isMaximized();
          const bounds = maximized
            ? entry.window.getNormalBounds()
            : entry.window.getBounds();
          entry.placement = { ...bounds, maximized };
        }
      }
      persist();
    },
  };
}
