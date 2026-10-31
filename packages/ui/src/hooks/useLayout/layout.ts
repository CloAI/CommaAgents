import type {
  DropZone,
  Layout,
  LayoutNode,
  PaneNode,
  SplitDirection,
} from "./layout.types";

/** Most panes the grid can hold. */
export const MAX_PANES = 8;
/** Route of an empty new chat. */
export const NEW_CHAT_PATH = "/";

/**
 * Create a unique identifier for a pane or split.
 * @returns {string} A random UUID.
 */
export function randomId(): string {
  return crypto.randomUUID();
}

/**
 * Create a layout holding one pane.
 * @param {string} path - Route the pane shows.
 * @param {() => string} makeId - Identifier source.
 * @returns {Layout} A one-pane layout.
 */
export function createLayout(
  path: string = NEW_CHAT_PATH,
  makeId: () => string = randomId,
): Layout {
  const id = makeId();
  return { root: { type: "pane", id, path }, activeId: id };
}

/**
 * List every pane in reading order.
 * @param {LayoutNode} node - Subtree to read.
 * @returns {PaneNode[]} Panes, depth first.
 */
export function listPanes(node: LayoutNode): PaneNode[] {
  return node.type === "pane" ? [node] : node.children.flatMap(listPanes);
}

/**
 * Check whether a subtree contains a pane.
 * @param {LayoutNode} node - Subtree to search.
 * @param {string} id - Pane identifier.
 * @returns {boolean} Whether the pane is in the subtree.
 */
export function containsPane(node: LayoutNode, id: string): boolean {
  return node.type === "pane"
    ? node.id === id
    : node.children.some((child) => containsPane(child, id));
}

/**
 * Check whether another pane can be added.
 * @param {Layout} layout - Current layout.
 * @returns {boolean} Whether the pane count is below the limit.
 */
export function canSplit(layout: Layout): boolean {
  return listPanes(layout.root).length < MAX_PANES;
}

/**
 * Collapse splits with one child and merge same-direction splits into their parent.
 * Sizes are dropped wherever the children changed.
 * @param {LayoutNode} node - Subtree to tidy.
 * @returns {LayoutNode} The tidied subtree.
 */
export function normalize(node: LayoutNode): LayoutNode {
  if (node.type === "pane") return node;
  const children = node.children.flatMap((child) => {
    const tidy = normalize(child);
    return tidy.type === "split" && tidy.direction === node.direction
      ? tidy.children
      : [tidy];
  });
  if (children.length === 1) return children[0]!;
  const unchanged =
    children.length === node.children.length &&
    children.every((child, index) => child === node.children[index]);
  return unchanged
    ? node
    : { type: "split", id: node.id, direction: node.direction, children };
}

/**
 * Remove a pane, leaving its siblings; empty splits disappear.
 * @param {LayoutNode} node - Subtree to edit.
 * @param {string} id - Pane to remove.
 * @returns {LayoutNode | undefined} The edited subtree, or undefined when nothing remains.
 */
function removePane(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.type === "pane") return node.id === id ? undefined : node;
  const children = node.children.flatMap((child) => {
    const remaining = removePane(child, id);
    return remaining ? [remaining] : [];
  });
  if (children.length === 0) return undefined;
  return children.length === node.children.length
    ? { ...node, children }
    : { type: "split", id: node.id, direction: node.direction, children };
}

/**
 * Put a pane next to another, joining its split when the direction matches.
 * @param {LayoutNode} node - Subtree to edit.
 * @param {string} targetId - Pane to place beside.
 * @param {PaneNode} added - Pane to insert.
 * @param {SplitDirection} direction - Axis of the new neighbors.
 * @param {"before" | "after"} placement - Side of the target.
 * @param {() => string} makeId - Identifier source for a new split.
 * @returns {LayoutNode} The edited subtree.
 */
function insertBeside(
  node: LayoutNode,
  targetId: string,
  added: PaneNode,
  direction: SplitDirection,
  placement: "before" | "after",
  makeId: () => string,
): LayoutNode {
  if (node.type === "pane") {
    if (node.id !== targetId) return node;
    return {
      type: "split",
      id: makeId(),
      direction,
      children: placement === "before" ? [added, node] : [node, added],
    };
  }
  const index = node.children.findIndex((child) => child.id === targetId);
  if (index !== -1 && node.direction === direction) {
    const children = [...node.children];
    children.splice(placement === "before" ? index : index + 1, 0, added);
    return {
      type: "split",
      id: node.id,
      direction,
      children,
    };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      insertBeside(child, targetId, added, direction, placement, makeId),
    ),
  };
}

/**
 * Add a new pane beside an existing one and focus it.
 * @param {Layout} layout - Current layout.
 * @param {string} id - Pane to split.
 * @param {SplitDirection} direction - "row" puts the new pane beside, "column" below.
 * @param {() => string} makeId - Identifier source.
 * @returns {Layout} The new layout, or the same one when the pane is missing or the limit is reached.
 */
export function splitPane(
  layout: Layout,
  id: string,
  direction: SplitDirection,
  makeId: () => string = randomId,
): Layout {
  if (!containsPane(layout.root, id) || !canSplit(layout)) return layout;
  const added: PaneNode = { type: "pane", id: makeId(), path: NEW_CHAT_PATH };
  return {
    root: normalize(
      insertBeside(layout.root, id, added, direction, "after", makeId),
    ),
    activeId: added.id,
  };
}

/**
 * Remove a pane; the last pane cannot be removed.
 * @param {Layout} layout - Current layout.
 * @param {string} id - Pane to close.
 * @returns {Layout} The new layout, focusing a neighbor when the closed pane had focus.
 */
export function closePane(layout: Layout, id: string): Layout {
  const order = listPanes(layout.root);
  const index = order.findIndex((pane) => pane.id === id);
  if (index === -1 || order.length <= 1) return layout;
  const remaining = removePane(layout.root, id);
  if (!remaining) return layout;
  const neighbor = order[index + 1] ?? order[index - 1]!;
  return {
    root: normalize(remaining),
    activeId: layout.activeId === id ? neighbor.id : layout.activeId,
  };
}

const ZONE_PLACEMENT: Record<
  DropZone,
  { readonly direction: SplitDirection; readonly placement: "before" | "after" }
> = {
  left: { direction: "row", placement: "before" },
  right: { direction: "row", placement: "after" },
  top: { direction: "column", placement: "before" },
  bottom: { direction: "column", placement: "after" },
};

/**
 * Dock a pane to an edge of another, splitting the target.
 * @param {Layout} layout - Current layout.
 * @param {string} sourceId - Pane being dragged.
 * @param {string} targetId - Pane it was dropped on.
 * @param {DropZone} zone - Edge of the target it was dropped on.
 * @param {() => string} makeId - Identifier source for a new split.
 * @returns {Layout} The new layout with the moved pane focused.
 */
export function movePane(
  layout: Layout,
  sourceId: string,
  targetId: string,
  zone: DropZone,
  makeId: () => string = randomId,
): Layout {
  const panes = listPanes(layout.root);
  const source = panes.find((pane) => pane.id === sourceId);
  const target = panes.find((pane) => pane.id === targetId);
  if (!source || !target || source === target) return layout;
  const without = removePane(layout.root, sourceId);
  if (!without) return layout;
  const { direction, placement } = ZONE_PLACEMENT[zone];
  return {
    root: normalize(
      insertBeside(without, targetId, source, direction, placement, makeId),
    ),
    activeId: sourceId,
  };
}

/**
 * Focus a pane.
 * @param {Layout} layout - Current layout.
 * @param {string} id - Pane to focus.
 * @returns {Layout} The new layout, or the same one when the pane is missing or already focused.
 */
export function setActivePane(layout: Layout, id: string): Layout {
  return layout.activeId === id || !containsPane(layout.root, id)
    ? layout
    : { ...layout, activeId: id };
}

/**
 * Change the route a pane shows.
 * @param {Layout} layout - Current layout.
 * @param {string} id - Pane to update.
 * @param {string} path - New route.
 * @returns {Layout} The new layout, or the same one when nothing changed.
 */
export function setPanePath(layout: Layout, id: string, path: string): Layout {
  const edit = (node: LayoutNode): LayoutNode =>
    node.type === "pane"
      ? node.id === id && node.path !== path
        ? { ...node, path }
        : node
      : { ...node, children: node.children.map(edit) };
  const root = edit(layout.root);
  return root === layout.root || sameTree(root, layout.root)
    ? layout
    : { ...layout, root };
}

/**
 * Record the sizes the user dragged a split's divider to.
 * @param {Layout} layout - Current layout.
 * @param {string} splitId - Split to update.
 * @param {readonly number[]} sizes - One size per child.
 * @returns {Layout} The new layout, or the same one when the sizes do not fit the split.
 */
export function setSplitSizes(
  layout: Layout,
  splitId: string,
  sizes: readonly number[],
): Layout {
  let changed = false;
  const edit = (node: LayoutNode): LayoutNode => {
    if (node.type === "pane") return node;
    if (
      node.id === splitId &&
      sizes.length === node.children.length &&
      sizes.every((size) => Number.isFinite(size) && size > 0)
    ) {
      // Dividers report sizes on every layout pass; ignore sub-pixel noise.
      const same = node.sizes?.every(
        (size, index) => Math.abs(size - sizes[index]!) < 1,
      );
      if (same) return node;
      changed = true;
      return { ...node, sizes: [...sizes] };
    }
    return { ...node, children: node.children.map(edit) };
  };
  const root = edit(layout.root);
  return changed ? { ...layout, root } : layout;
}

/**
 * Compare two trees by value for the cheap case of an unchanged edit.
 * @param {LayoutNode} a - First tree.
 * @param {LayoutNode} b - Second tree.
 * @returns {boolean} Whether both describe the same layout.
 */
function sameTree(a: LayoutNode, b: LayoutNode): boolean {
  if (a === b) return true;
  if (a.type === "pane")
    return b.type === "pane" && a.id === b.id && a.path === b.path;
  return (
    b.type === "split" &&
    a.id === b.id &&
    a.direction === b.direction &&
    a.children.length === b.children.length &&
    a.children.every((child, index) => sameTree(child, b.children[index]!))
  );
}
