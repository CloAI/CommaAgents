import {
  closePane,
  createLayout,
  dockPane,
  randomId,
  containsPane,
  listPanes,
  movePane,
  setActivePane,
  setPanePath,
  setSplitSizes,
  splitPane,
} from "./layout";
import type { DropZone, SplitDirection } from "./layout.types";
import type { LayoutState } from "./useLayout.types";

/** A change to the layout state. */
export type LayoutAction =
  | { readonly type: "replace"; readonly state: LayoutState }
  | { readonly type: "newChat"; readonly id: string }
  | {
      readonly type: "restore";
      readonly paneId: string;
      readonly runId: string;
    }
  | {
      readonly type: "split";
      readonly id: string;
      readonly direction: SplitDirection;
    }
  | { readonly type: "close"; readonly id: string }
  | {
      readonly type: "move";
      readonly sourceId: string;
      readonly targetId: string;
      readonly zone: DropZone;
    }
  | { readonly type: "activate"; readonly id: string }
  | { readonly type: "path"; readonly id: string; readonly path: string }
  | {
      readonly type: "sizes";
      readonly splitId: string;
      readonly sizes: readonly number[];
    }
  | { readonly type: "maximize"; readonly id: string }
  | { readonly type: "drag"; readonly id: string | undefined }
  | {
      readonly type: "strategy";
      readonly paneId: string;
      readonly path: string;
    };

/**
 * Drop session state that refers to panes that no longer exist.
 * @param {LayoutState} state - State after a layout change.
 * @returns {LayoutState} State without stale maximize or strategy entries.
 */
function prune(state: LayoutState): LayoutState {
  const ids = new Set(listPanes(state.layout.root).map((pane) => pane.id));
  return {
    ...state,
    draggingId:
      state.draggingId !== undefined && ids.has(state.draggingId)
        ? state.draggingId
        : undefined,
    maximizedId:
      state.maximizedId !== undefined && ids.has(state.maximizedId)
        ? state.maximizedId
        : undefined,
  };
}

/**
 * Apply one action to the layout state.
 * @param {LayoutState} state - Current state.
 * @param {LayoutAction} action - Requested change.
 * @returns {LayoutState} The next state; the same object when nothing changed.
 */
export function layoutReducer(
  state: LayoutState,
  action: LayoutAction,
): LayoutState {
  switch (action.type) {
    case "replace":
      return action.state;
    case "newChat": {
      if (listPanes(state.layout.root).length === 0) {
        return { ...state, layout: createLayout("/", () => action.id) };
      }
      const pane = listPanes(state.layout.root).find(
        (entry) => entry.id === state.layout.activeId,
      )!;
      const runId = /^\/runs\/([^/]+)/.exec(pane.path)?.[1];
      const collection = state.paneCollections?.[pane.id];
      const withHistory = {
        ...state,
        paneCollections: {
          ...state.paneCollections,
          [pane.id]: {
            paneId: pane.id,
            chatIds: [
              ...new Set([
                ...(collection?.chatIds ?? []),
                ...(runId ? [runId] : []),
              ]),
            ],
            selectedChatId: undefined,
            draftId: action.id,
            closed: false,
          },
        },
      };
      return {
        ...withHistory,
        layout: setPanePath(state.layout, pane.id, "/"),
      };
    }
    case "restore": {
      const existing = state.paneCollections?.[action.paneId];
      const paneId = action.paneId || state.layout.activeId;
      const restoredLayout = containsPane(state.layout.root, paneId)
        ? state.layout
        : dockPane(
            state.layout,
            { type: "pane", id: paneId, path: `/runs/${action.runId}` },
            state.layout.activeId,
            "right",
          );
      return layoutReducer(
        {
          ...state,
          layout: setActivePane(restoredLayout, paneId),
          paneCollections: {
            ...state.paneCollections,
            [paneId]: {
              paneId,
              chatIds: [
                ...new Set([...(existing?.chatIds ?? []), action.runId]),
              ],
              selectedChatId: action.runId,
              closed: false,
            },
          },
        },
        { type: "path", id: paneId, path: `/runs/${action.runId}` },
      );
    }
    case "split": {
      const layout = splitPane(state.layout, action.id, action.direction);
      // A new pane next to a maximized one would be hidden, so return to the grid.
      return layout === state.layout
        ? state
        : { ...state, layout, maximizedId: undefined };
    }
    case "close": {
      const layout = closePane(state.layout, action.id);
      return layout === state.layout
        ? state
        : prune({
            ...state,
            layout,
            paneCollections: {
              ...state.paneCollections,
              [action.id]: {
                paneId: action.id,
                chatIds: state.paneCollections?.[action.id]?.chatIds ?? [],
                closed: true,
                selectedChatId:
                  state.paneCollections?.[action.id]?.selectedChatId,
              },
            },
          });
    }
    case "move": {
      const layout = movePane(
        state.layout,
        action.sourceId,
        action.targetId,
        action.zone,
      );
      return layout === state.layout ? state : prune({ ...state, layout });
    }
    case "activate": {
      const layout = setActivePane(state.layout, action.id);
      return layout === state.layout ? state : { ...state, layout };
    }
    case "path": {
      const layout = setPanePath(state.layout, action.id, action.path);
      const runId = /^\/runs\/([^/]+)/.exec(action.path)?.[1];
      const previous = state.paneCollections?.[action.id];
      if (
        layout === state.layout &&
        previous?.selectedChatId === runId &&
        !previous?.closed &&
        previous
      ) {
        return state;
      }
      return {
        ...state,
        layout,
        paneCollections: {
          ...state.paneCollections,
          [action.id]: {
            ...(action.path === "/" && previous?.selectedChatId
              ? { draftId: randomId() }
              : previous?.draftId
                ? { draftId: previous.draftId }
                : {}),
            paneId: action.id,
            chatIds: runId
              ? [...new Set([...(previous?.chatIds ?? []), runId])]
              : (previous?.chatIds ?? []),
            selectedChatId: runId,
            closed: false,
          },
        },
      };
    }
    case "sizes": {
      const layout = setSplitSizes(state.layout, action.splitId, action.sizes);
      return layout === state.layout ? state : { ...state, layout };
    }
    case "maximize":
      if (!containsPane(state.layout.root, action.id)) {
        return state;
      }
      return {
        ...state,
        maximizedId: state.maximizedId === action.id ? undefined : action.id,
        layout: setActivePane(state.layout, action.id),
      };
    case "drag":
      return state.draggingId === action.id
        ? state
        : { ...state, draggingId: action.id };
    case "strategy":
      return state.strategyChoices[action.paneId] === action.path
        ? state
        : {
            ...state,
            strategyChoices: {
              ...state.strategyChoices,
              [action.paneId]: action.path,
            },
          };
  }
}
