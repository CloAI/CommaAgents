import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import type { ReactNode } from "react";
import { canSplit, listPanes } from "./layout";
import type { DropZone, SplitDirection } from "./layout.types";
import { loadLayout, saveLayout } from "./layout.storage";
import { layoutReducer } from "./useLayout.reducer";
import type { LayoutContextValue, LayoutState } from "./useLayout.types";

export const LayoutContext = createContext<LayoutContextValue | null>(null);

/** Layout provider options. */
export interface LayoutProviderProps {
  /** Route from the address bar to open in the focused pane at startup. */
  readonly initialPath?: string;
  /** Components sharing the layout. */
  readonly children: ReactNode;
}

/** Milliseconds to wait for further changes before saving. */
const SAVE_DELAY = 250;

/**
 * Restore the saved layout and expose operations that keep it saved.
 * @param {LayoutProviderProps} props - Startup route and content.
 * @returns {React.ReactElement} The shared layout provider.
 */
export function LayoutProvider({ initialPath, children }: LayoutProviderProps) {
  const [state, dispatch] = useReducer(
    layoutReducer,
    initialPath,
    (path): LayoutState => ({
      layout: loadLayout(path),
      strategyChoices: {},
    }),
  );
  const { layout } = state;

  // Dragging a divider changes sizes many times; save once things settle.
  useEffect(() => {
    const timer = window.setTimeout(() => saveLayout(layout), SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [layout]);

  const splitPane = useCallback(
    (id: string, direction: SplitDirection) =>
      dispatch({ type: "split", id, direction }),
    [],
  );
  const closePane = useCallback(
    (id: string) => dispatch({ type: "close", id }),
    [],
  );
  const movePane = useCallback(
    (sourceId: string, targetId: string, zone: DropZone) =>
      dispatch({ type: "move", sourceId, targetId, zone }),
    [],
  );
  const activatePane = useCallback(
    (id: string) => dispatch({ type: "activate", id }),
    [],
  );
  const setPanePath = useCallback(
    (id: string, path: string) => dispatch({ type: "path", id, path }),
    [],
  );
  const setSplitSizes = useCallback(
    (splitId: string, sizes: readonly number[]) =>
      dispatch({ type: "sizes", splitId, sizes }),
    [],
  );
  const toggleMaximize = useCallback(
    (id: string) => dispatch({ type: "maximize", id }),
    [],
  );
  const setDragging = useCallback(
    (id: string | undefined) => dispatch({ type: "drag", id }),
    [],
  );
  const chooseStrategy = useCallback(
    (paneId: string, path: string) =>
      dispatch({ type: "strategy", paneId, path }),
    [],
  );

  const value = useMemo<LayoutContextValue>(
    () => ({
      ...state,
      paneCount: listPanes(state.layout.root).length,
      canSplit: canSplit(state.layout),
      splitPane,
      closePane,
      movePane,
      activatePane,
      setPanePath,
      setSplitSizes,
      toggleMaximize,
      setDragging,
      chooseStrategy,
    }),
    [
      state,
      splitPane,
      closePane,
      movePane,
      activatePane,
      setPanePath,
      setSplitSizes,
      toggleMaximize,
      setDragging,
      chooseStrategy,
    ],
  );
  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}
