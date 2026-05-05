import { useContext, useEffect, useRef, useState } from "react";
import { MouseContext } from "../../components/MouseProvider/MouseContext";
import { isInsideRef } from "../useMouse/useMouse.utils";
import type { MouseEvent } from "../useMouse/useMouse.types";
import type { UseMouseHoverOptions, UseMouseHoverResult } from "./useMouseHover.types";

/**
 * Track whether the mouse cursor is hovering over a specific element.
 *
 * Requires `?1003h` (any-event motion tracking) which {@link MouseProvider}
 * enables automatically while at least one `useMouseHover` hook is mounted.
 * Wrap the component tree in `<MouseProvider>` (done by `<Frame>`) before
 * using this hook.
 *
 * AABB hit-testing is performed on every mouse event by walking the Yoga
 * layout tree. The `isHovered` boolean only triggers a re-render on
 * enter/leave transitions to minimise unnecessary renders.
 *
 * @example
 * ```tsx
 * const ref = useRef<DOMElement>(null);
 * const { isHovered } = useMouseHover({
 *   ref,
 *   onEnter: () => console.log("entered"),
 *   onLeave: () => console.log("left"),
 * });
 * return <Box ref={ref} backgroundColor={isHovered ? "blue" : undefined} />;
 * ```
 */
export function useMouseHover({
  ref,
  onEnter,
  onLeave,
  onMove,
}: UseMouseHoverOptions): UseMouseHoverResult {
  const { subscribe, registerHoverConsumer } = useContext(MouseContext);

  // Track internal hover state in a ref to avoid stale closures in the
  // subscriber, and as React state so consumers re-render on transitions.
  const isHoveredRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);

  // Stable refs for the callbacks so we don't re-subscribe when they change.
  const onEnterRef = useRef(onEnter);
  const onLeaveRef = useRef(onLeave);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);
  useEffect(() => { onLeaveRef.current = onLeave; }, [onLeave]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);

  // Register as a hover consumer so the provider enables ?1003h.
  useEffect(() => {
    return registerHoverConsumer();
  }, [registerHoverConsumer]);

  // Subscribe to mouse events and run AABB hit-tests.
  useEffect(() => {
    return subscribe((event: MouseEvent) => {
      // Only consider event kinds that carry cursor position.
      const { kind } = event;
      if (
        kind !== "move" &&
        kind !== "drag" &&
        kind !== "press" &&
        kind !== "release"
      ) {
        return;
      }

      const inside = isInsideRef(ref, event.column, event.row);
      const wasInside = isHoveredRef.current;

      if (inside && !wasInside) {
        // Enter transition.
        isHoveredRef.current = true;
        setIsHovered(true);
        onEnterRef.current?.(event);
        onMoveRef.current?.(event);
      } else if (!inside && wasInside) {
        // Leave transition.
        isHoveredRef.current = false;
        setIsHovered(false);
        onLeaveRef.current?.(event);
      } else if (inside && wasInside) {
        // Still inside — fire onMove without a state update.
        onMoveRef.current?.(event);
      }
    });
  }, [subscribe, ref]);

  return { isHovered };
}
