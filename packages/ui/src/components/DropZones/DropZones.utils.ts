import type { DropZone } from "../../hooks/useLayout";

/**
 * Decide which edge of a pane a pointer is nearest to.
 * @param {number} x - Pointer offset from the pane's left edge.
 * @param {number} y - Pointer offset from the pane's top edge.
 * @param {number} width - Pane width.
 * @param {number} height - Pane height.
 * @returns {DropZone} The closest edge, measured as a share of the pane's size.
 */
export function zoneAt(
  x: number,
  y: number,
  width: number,
  height: number,
): DropZone {
  const fx = width === 0 ? 0.5 : x / width;
  const fy = height === 0 ? 0.5 : y / height;
  const nearest = [
    { zone: "left", distance: fx },
    { zone: "right", distance: 1 - fx },
    { zone: "top", distance: fy },
    { zone: "bottom", distance: 1 - fy },
  ] as const;
  return nearest.reduce((best, next) =>
    next.distance < best.distance ? next : best,
  ).zone;
}
