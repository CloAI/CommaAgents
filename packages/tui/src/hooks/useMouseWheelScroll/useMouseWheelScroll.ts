import { useContext, useEffect, useRef } from "react";
import { MouseContext } from "../../components/MouseProvider/MouseContext";
import { isInsideRef } from "../useMouse/useMouse.utils";
import type { MouseEvent } from "../useMouse/useMouse.types";
import type { MouseScrollEvent, UseMouseWheelScrollOptions } from "./useMouseWheelScroll.types";

/**
 * Subscribe to mouse-wheel scroll events via the global {@link MouseProvider}
 * event bus.
 *
 * Shares the single `useInput` subscription in {@link MouseProvider} with all
 * other mouse hooks rather than registering its own.
 *
 * Optionally accepts a `ref` for AABB hit-testing: when provided, only wheel
 * ticks whose terminal coordinates fall inside the element's bounding box are
 * forwarded to `onScroll`. This is useful when multiple scrollable regions
 * are on screen simultaneously — each can restrict its listener to its own
 * box without coordinating with siblings.
 *
 * Requires `<MouseProvider>` to be mounted (provided by `<Frame>`).
 *
 * @example
 * ```tsx
 * // Global — any wheel tick triggers onScroll.
 * useMouseWheelScroll({ onScroll: ({ direction }) => step(direction) });
 *
 * // Scoped — only ticks inside this element trigger onScroll.
 * const ref = useRef<DOMElement>(null);
 * useMouseWheelScroll({ ref, onScroll: ({ direction }) => step(direction) });
 * return <Box ref={ref}>...</Box>;
 * ```
 */
export function useMouseWheelScroll({ onScroll, ref }: UseMouseWheelScrollOptions): void {
  const { subscribe } = useContext(MouseContext);

  // Stable ref so we don't re-subscribe when the callback identity changes.
  const onScrollRef = useRef(onScroll);
  useEffect(() => { onScrollRef.current = onScroll; }, [onScroll]);

  useEffect(() => {
    return subscribe((event: MouseEvent) => {
      if (event.kind !== "wheel-up" && event.kind !== "wheel-down") return;

      // If a ref was provided, gate on whether the tick lands inside the box.
      if (ref !== undefined && !isInsideRef(ref, event.column, event.row)) return;

      const scrollEvent: MouseScrollEvent = {
        direction: event.kind === "wheel-up" ? "up" : "down",
        column: event.column,
        row: event.row,
      };

      onScrollRef.current(scrollEvent);
    });
  }, [subscribe, ref]);
}
