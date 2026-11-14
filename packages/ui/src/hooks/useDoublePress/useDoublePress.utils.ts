import type { PressEvent } from "./useDoublePress.types";

/**
 * Decide whether an event is an unmodified press of the key, not consumed elsewhere.
 * @param {PressEvent} event - Keyboard event.
 * @param {string} key - Watched `KeyboardEvent.key`.
 * @returns {boolean} Whether it counts as a press.
 */
export function isPlainPress(event: PressEvent, key: string): boolean {
  return (
    event.key === key &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  );
}
