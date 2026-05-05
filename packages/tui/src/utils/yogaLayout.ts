import type { DOMElement } from "ink";

/**
 * Yoga-computed bounding box of a DOM element with absolute terminal
 * coordinates. All values are in terminal cells (columns / rows).
 */
export interface BoundingBox {
  /** Absolute row of the element's top edge (0-indexed). */
  readonly top: number;
  /** Absolute column of the element's left edge (0-indexed). */
  readonly left: number;
  /** Element width in terminal columns. */
  readonly width: number;
  /** Element height in terminal rows. */
  readonly height: number;
}

/**
 * Walk up the Yoga layout tree from a {@link DOMElement} to compute its
 * absolute top/left position within Ink's terminal output.
 *
 * Each node's `getComputedTop()` / `getComputedLeft()` is relative to its
 * parent, so we accumulate offsets up to the root.
 */
export function getAbsolutePosition(node: DOMElement): { top: number; left: number } {
  let top = 0;
  let left = 0;
  let current: DOMElement | undefined = node;

  while (current) {
    const yoga = current.yogaNode;
    if (yoga) {
      top += yoga.getComputedTop();
      left += yoga.getComputedLeft();
    }
    current = current.parentNode;
  }

  return { top, left };
}

/**
 * Return the absolute {@link BoundingBox} of a {@link DOMElement} by
 * combining a Yoga tree-walk for position with the node's own computed
 * width and height.
 */
export function getBoundingBox(node: DOMElement): BoundingBox {
  const { top, left } = getAbsolutePosition(node);
  const yoga = node.yogaNode;
  const width = yoga ? yoga.getComputedWidth() : 0;
  const height = yoga ? yoga.getComputedHeight() : 0;
  return { top, left, width, height };
}
