import type { DropZone, Layout, SplitDirection } from "./layout.types";

/** Stable collection of chats belonging to one pane, including closed panes. */
export interface PaneCollection {
  readonly paneId: string;
  readonly chatIds: readonly string[];
  readonly selectedChatId?: string;
  /** Identity of the current blank draft, independent from the stable pane. */
  readonly draftId?: string;
  readonly closed: boolean;
}

/** Saved client presentation for one daemon project. */
export interface ClientWorkspaceRecord {
  readonly projectId: string;
  readonly state: LayoutState;
  readonly windowStates?: readonly LayoutState[];
}

/** Client-owned presentation; the daemon never stores layouts. */
export interface ClientWorkspaceStore {
  readonly activeProjectId: string;
  readonly workspaces: Readonly<Record<string, ClientWorkspaceRecord>>;
}

/** Layout plus state that lasts only for this session. */
export interface LayoutState {
  /** The grid; saved and restored. */
  readonly layout: Layout;
  readonly paneCollections?: Readonly<Record<string, PaneCollection>>;
  /** Pane being dragged, if any; not saved. */
  readonly draggingId?: string;
  /** Pane filling the workspace, if any; not saved. */
  readonly maximizedId?: string;
  /** Strategy each new-chat pane chose, by pane ID; not saved. */
  readonly strategyChoices: Readonly<Record<string, string>>;
}

/** Layout state and the operations that change it. */
export interface LayoutContextValue extends LayoutState {
  readonly replaceState: (state: LayoutState) => void;
  readonly restoreChat: (paneId: string, runId: string) => void;
  /** Replace the focused pane with an empty chat. */
  readonly newChat: () => void;
  /** Number of panes in the grid. */
  readonly paneCount: number;
  /** Whether another pane fits. */
  readonly canSplit: boolean;
  /** Add an empty chat beside or below a pane. */
  readonly splitPane: (id: string, direction: SplitDirection) => void;
  /** Remove a pane. */
  readonly closePane: (id: string) => void;
  /** Dock or swap a pane relative to another. */
  readonly movePane: (
    sourceId: string,
    targetId: string,
    zone: DropZone,
  ) => void;
  /** Focus a pane. */
  readonly activatePane: (id: string) => void;
  /** Record the route a pane shows. */
  readonly setPanePath: (id: string, path: string) => void;
  /** Record the sizes of a split's children. */
  readonly setSplitSizes: (splitId: string, sizes: readonly number[]) => void;
  /** Fill the workspace with a pane, or return to the grid when it already does. */
  readonly toggleMaximize: (id: string) => void;
  /** Note which pane is being dragged, or that none is. */
  readonly setDragging: (id: string | undefined) => void;
  /** Remember the strategy a new-chat pane chose. */
  readonly chooseStrategy: (paneId: string, path: string) => void;
}
