import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { canSplit, listPanes, randomId } from "./layout";
import type { DropZone, SplitDirection } from "./layout.types";
import { loadLayout, saveLayout } from "./layout.storage";
import { layoutReducer } from "./useLayout.reducer";
import type { LayoutContextValue, LayoutState } from "./useLayout.types";
import type { LayoutAction } from "./useLayout.reducer";
import { loadClientWorkspaces } from "../useWorkspaces/useWorkspaces.utils";
import { useHost } from "../useHost";

const subscribeBrowser = () => () => {};
const browserSnapshot = () => undefined;

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
  const { workspace } = useHost();
  const remote = useSyncExternalStore(
    workspace?.subscribe ?? subscribeBrowser,
    workspace?.getSnapshot ?? browserSnapshot,
  );
  const [localState, localDispatch] = useReducer(
    layoutReducer,
    initialPath,
    (path): LayoutState => {
      if (workspace) {
        return workspace.getSnapshot().state;
      }
      try {
        if (localStorage.getItem("comma-agents.workspaces")) {
          const saved = loadClientWorkspaces();
          const restored = saved.workspaces[saved.activeProjectId]?.state;
          if (restored) {
            return restored;
          }
        }
      } catch {
        /* Start with an empty layout when storage is unavailable. */
      }
      return {
        layout: loadLayout(path),
        strategyChoices: loadStrategyChoices(),
      };
    },
  );
  const state = remote?.state ?? localState;
  const dispatch = useCallback(
    (action: LayoutAction) => {
      if (workspace) {
        workspace.send({ type: "layout", action });
      } else {
        localDispatch(action);
      }
    },
    [workspace],
  );
  const { layout } = state;
  useEffect(() => {
    workspace?.ready();
  }, [workspace]);

  // Dragging a divider changes sizes many times; save once things settle.
  useEffect(() => {
    if (workspace) {
      return;
    }
    const timer = window.setTimeout(() => saveLayout(layout), SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [layout, workspace]);
  useEffect(() => {
    if (workspace) {
      return;
    }
    try {
      window.localStorage.setItem(
        "comma-agents.strategies",
        JSON.stringify(state.strategyChoices),
      );
    } catch {
      /* Storage may be unavailable. */
    }
  }, [state.strategyChoices, workspace]);

  const newChat = useCallback(
    () => dispatch({ type: "newChat", id: randomId() }),
    [dispatch],
  );
  const splitPane = useCallback(
    (id: string, direction: SplitDirection) =>
      dispatch({ type: "split", id, direction }),
    [dispatch],
  );
  const closePane = useCallback(
    (id: string) => dispatch({ type: "close", id }),
    [dispatch],
  );
  const movePane = useCallback(
    (sourceId: string, targetId: string, zone: DropZone) =>
      dispatch({ type: "move", sourceId, targetId, zone }),
    [dispatch],
  );
  const activatePane = useCallback(
    (id: string) => dispatch({ type: "activate", id }),
    [dispatch],
  );
  const setPanePath = useCallback(
    (id: string, path: string) => dispatch({ type: "path", id, path }),
    [dispatch],
  );
  const setSplitSizes = useCallback(
    (splitId: string, sizes: readonly number[]) =>
      dispatch({ type: "sizes", splitId, sizes }),
    [dispatch],
  );
  const toggleMaximize = useCallback(
    (id: string) => dispatch({ type: "maximize", id }),
    [dispatch],
  );
  const setDragging = useCallback(
    (id: string | undefined) => dispatch({ type: "drag", id }),
    [dispatch],
  );
  const chooseStrategy = useCallback(
    (paneId: string, path: string) =>
      dispatch({ type: "strategy", paneId, path }),
    [dispatch],
  );

  const value = useMemo<LayoutContextValue>(
    () => ({
      ...state,
      replaceState: (state) => dispatch({ type: "replace", state }),
      restoreChat: (paneId, runId) =>
        dispatch({ type: "restore", paneId, runId }),
      paneCount: listPanes(state.layout.root).length,
      canSplit: canSplit(state.layout),
      newChat,
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
      dispatch,
      newChat,
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

/**
 * Restore per-chat strategy choices after a browser restart.
 * @returns {Readonly<Record<string, string>>} Saved choices or an empty map.
 */
function loadStrategyChoices(): Readonly<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem("comma-agents.strategies") ?? "{}",
    );
    return value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value).every((entry) => typeof entry === "string")
      ? (value as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}
