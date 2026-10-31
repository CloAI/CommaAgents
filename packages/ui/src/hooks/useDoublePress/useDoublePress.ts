import { useCallback, useEffect, useRef, useState } from "react";
import {
  DIALOG_SELECTOR,
  DOUBLE_PRESS_INTERVAL_MS,
} from "./useDoublePress.constants";
import type { DoublePress, DoublePressOptions } from "./useDoublePress.types";
import { isPlainPress } from "./useDoublePress.utils";

/**
 * Call back when a key is pressed twice in quick succession, arming a hint after the first press.
 * Any other key, a pointer press, leaving the window, or a press inside a dialog disarms it.
 * @param {DoublePressOptions} options - Key, scope, and trigger.
 * @returns {DoublePress} Whether the trigger is armed.
 */
export function useDoublePress({
  key,
  enabled,
  onTrigger,
  intervalMs = DOUBLE_PRESS_INTERVAL_MS,
  scopeRef,
  isInScope,
}: DoublePressOptions): DoublePress {
  const [armed, setArmed] = useState(false);
  const lastPress = useRef<number | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarm = useCallback(() => {
    lastPress.current = null;
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = null;
    setArmed(false);
  }, []);
  useEffect(() => {
    disarm();
    const ownerDocument = scopeRef.current?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!enabled || !ownerDocument || !ownerWindow) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !isPlainPress(event, key) ||
        isInScope?.(target) === false ||
        target?.closest(DIALOG_SELECTOR)
      )
        return disarm();
      if (event.repeat) return;
      event.preventDefault();
      const pressedAt = performance.now();
      if (
        lastPress.current !== null &&
        pressedAt - lastPress.current <= intervalMs
      ) {
        disarm();
        onTrigger();
        return;
      }
      disarm();
      lastPress.current = pressedAt;
      setArmed(true);
      timeout.current = setTimeout(disarm, intervalMs);
    };
    ownerDocument.addEventListener("keydown", handleKeyDown);
    ownerDocument.addEventListener("pointerdown", disarm);
    ownerWindow.addEventListener("blur", disarm);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown);
      ownerDocument.removeEventListener("pointerdown", disarm);
      ownerWindow.removeEventListener("blur", disarm);
      if (timeout.current !== null) clearTimeout(timeout.current);
    };
  }, [key, enabled, onTrigger, intervalMs, scopeRef, isInScope, disarm]);
  return { armed };
}
