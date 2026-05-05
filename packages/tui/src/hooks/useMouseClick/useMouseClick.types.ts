import type React from "react";
import type { DOMElement } from "ink";
import type { MouseEvent } from "../useMouse/useMouse.types";

/**
 * Options accepted by {@link useMouseClick}.
 */
export interface UseMouseClickOptions {
  /**
   * Ref to the `DOMElement` (Ink `<Box>` or similar) whose bounds are used
   * for hit-testing. The element must be mounted before click events fire.
   */
  readonly ref: React.RefObject<DOMElement | null>;

  /**
   * Called when a mouse button press event hits the element's bounding box.
   * Receives the full {@link MouseEvent} so the caller can inspect which
   * button was pressed and what modifier keys were held.
   */
  readonly onClick: (event: MouseEvent) => void;

  /**
   * Which button indices trigger `onClick`. Defaults to `[0]` (left button
   * only). Pass `[0, 1, 2]` to react to any button.
   *
   * `0` = left, `1` = middle, `2` = right.
   *
   * @default [0]
   */
  readonly buttons?: readonly (0 | 1 | 2)[];
}
