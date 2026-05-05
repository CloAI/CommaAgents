/** Direction of a mouse-wheel scroll tick. */
export type MouseScrollDirection = "up" | "down";

/**
 * A parsed mouse-scroll event delivered to {@link useMouseWheelScroll}'s
 * `onScroll` callback.
 *
 * Coordinates follow the SGR (1006) protocol: `column` and `row` are
 * 1-indexed terminal cell coordinates reported by the terminal at the time
 * the scroll tick was emitted.
 */
export interface MouseScrollEvent {
  readonly direction: MouseScrollDirection;
  readonly column: number;
  readonly row: number;
}

/**
 * Options for {@link useMouseWheelScroll}.
 */
export interface UseMouseWheelScrollOptions {
  /**
   * Invoked for every mouse-wheel tick whose position falls inside the
   * element's bounding box, or for every tick regardless of position when
   * `ref` is omitted.
   */
  readonly onScroll: (event: MouseScrollEvent) => void;
  /**
   * Optional ref to a `DOMElement`. When provided, only wheel ticks whose
   * terminal coordinates land inside the element's bounding box are
   * forwarded to `onScroll`. When omitted, all wheel ticks are forwarded.
   */
  readonly ref?: React.RefObject<import("ink").DOMElement | null>;
}
