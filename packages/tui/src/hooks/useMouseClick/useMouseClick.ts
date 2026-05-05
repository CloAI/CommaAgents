import { useContext, useEffect, useRef } from "react";
import { MouseContext } from "../../components/MouseProvider/MouseContext";
import { isInsideRef } from "../useMouse/useMouse.utils";
import type { MouseEvent } from "../useMouse/useMouse.types";
import type { UseMouseClickOptions } from "./useMouseClick.types";

/** Default: react to left-button presses only. */
const DEFAULT_BUTTONS: readonly (0 | 1 | 2)[] = [0];

/**
 * Fire a callback when the user clicks inside a specific element.
 *
 * Works under the existing `?1000h` / `?1006h` mouse mode that {@link Frame}
 * enables by default — no motion tracking (`?1003h`) required.
 * Wrap the component tree in `<MouseProvider>` (done by `<Frame>`) before
 * using this hook.
 *
 * Only `press` events are surfaced (not release or drag). AABB hit-testing
 * runs on every press event by walking the Yoga layout tree.
 *
 * **Click-to-focus pattern:**
 * ```tsx
 * const ref = useRef<DOMElement>(null);
 * const { focus } = useFocusManager();
 * useMouseClick({ ref, onClick: () => focus(myId) });
 * return <Box ref={ref}>...</Box>;
 * ```
 *
 * @param options - See {@link UseMouseClickOptions}.
 */
export function useMouseClick({
  ref,
  onClick,
  buttons = DEFAULT_BUTTONS,
}: UseMouseClickOptions): void {
  const { subscribe } = useContext(MouseContext);

  // Stable ref for the callback so we don't re-subscribe when it changes.
  const onClickRef = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);

  // Stable ref for buttons array — compare by identity, not contents.
  const buttonsRef = useRef(buttons);
  useEffect(() => { buttonsRef.current = buttons; }, [buttons]);

  useEffect(() => {
    return subscribe((event: MouseEvent) => {
      if (event.kind !== "press") return;
      if (event.button === null) return;
      if (!buttonsRef.current.includes(event.button)) return;
      if (!isInsideRef(ref, event.column, event.row)) return;
      onClickRef.current(event);
    });
  }, [subscribe, ref]);
}
