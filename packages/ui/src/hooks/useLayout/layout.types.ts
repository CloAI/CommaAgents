/** Which way a split lays out its children: side by side, or stacked. */
export type SplitDirection = "row" | "column";

/** The edge of a target pane a dragged pane docks to, splitting the target. */
export type DropZone = "left" | "right" | "top" | "bottom";

/** A leaf that shows one route. */
export interface PaneNode {
  readonly type: "pane";
  /** Unique within the layout. */
  readonly id: string;
  /** Route the pane currently shows. */
  readonly path: string;
}

/** Children laid out in one direction with a draggable divider between them. */
export interface SplitNode {
  readonly type: "split";
  /** Unique within the layout. */
  readonly id: string;
  readonly direction: SplitDirection;
  /** At least two children. */
  readonly children: readonly LayoutNode[];
  /** Child sizes last set by dragging a divider; absent until then. */
  readonly sizes?: readonly number[];
}

/** A pane or a split of panes. */
export type LayoutNode = PaneNode | SplitNode;

/** The whole grid and the pane that currently has focus. */
export interface Layout {
  readonly root: LayoutNode;
  readonly activeId: string;
}
