import {
  closePane,
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
  const choices = Object.entries(state.strategyChoices).filter(([id]) =>
    ids.has(id),
  );
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
    strategyChoices:
      choices.length === Object.keys(state.strategyChoices).length
        ? state.strategyChoices
        : Object.fromEntries(choices),
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
    case "split": {
      const layout = splitPane(state.layout, action.id, action.direction);
      // A new pane next to a maximized one would be hidden, so return to the grid.
      return layout === state.layout
        ? state
        : { ...state, layout, maximizedId: undefined };
    }
    case "close": {
      const layout = closePane(state.layout, action.id);
      return layout === state.layout ? state : prune({ ...state, layout });
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
      return layout === state.layout ? state : { ...state, layout };
    }
    case "sizes": {
      const layout = setSplitSizes(state.layout, action.splitId, action.sizes);
      return layout === state.layout ? state : { ...state, layout };
    }
    case "maximize":
      if (!containsPane(state.layout.root, action.id)) return state;
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
