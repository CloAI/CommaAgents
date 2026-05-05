import type React from "react";
import type { DOMElement } from "ink";
import type { MouseEvent } from "../useMouse/useMouse.types";

/**
 * Options accepted by {@link useMouseHover}.
 */
export interface UseMouseHoverOptions {
  /**
   * Ref to the `DOMElement` (Ink `<Box>` or similar) whose bounds are used
   * for hit-testing. The element must be mounted before hover events fire.
   */
  readonly ref: React.RefObject<DOMElement | null>;

  /**
   * Called once when the mouse cursor enters the element's bounding box.
   * Receives the first mouse event that triggered the transition.
   */
  readonly onEnter?: (event: MouseEvent) => void;

  /**
   * Called once when the mouse cursor leaves the element's bounding box.
   * Receives the first mouse event that triggered the transition.
   */
  readonly onLeave?: (event: MouseEvent) => void;

  /**
   * Called for every mouse event while the cursor is inside the bounding box.
   * This includes the first event that triggered `onEnter`.
   */
  readonly onMove?: (event: MouseEvent) => void;
}

/**
 * Result returned by {@link useMouseHover}.
 */
export interface UseMouseHoverResult {
  /**
   * `true` while the mouse cursor is inside the element's bounding box,
   * `false` otherwise. Transitions cause a re-render of the consumer.
   */
  readonly isHovered: boolean;
}
