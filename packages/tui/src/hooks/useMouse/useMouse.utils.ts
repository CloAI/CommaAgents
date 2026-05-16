import type { DOMElement } from "ink";
import type React from "react";
import {
  isMouseEscape,
  SGR_MOUSE_PREFIX,
  SGR_MOUSE_TAIL_PATTERN,
} from "../../utils/mouseEscape";
import { getBoundingBox } from "../../utils/yogaLayout";
import type {
  MouseEvent,
  MouseEventKind,
  MouseModifiers,
} from "./useMouse.types";

// ---------------------------------------------------------------------------
// SGR mouse parsing
// ---------------------------------------------------------------------------

/**
 * SGR (1006) mouse escape pattern, as forwarded by Ink's `useInput` after
 * the leading `\x1b` has been stripped:
 *
 * ```
 * [<BTN;COL;ROW(M|m)
 * ```
 *
 * Capture groups: 1 = button code, 2 = column, 3 = row, 4 = `M`|`m`.
 * Not anchored — used with `.exec()` in a `while` loop to find every
 * sequence bundled into one chunk.
 */
const SGR_MOUSE_TOKEN = /\[<(\d+);(\d+);(\d+)([Mm])/g;

/** SGR button-byte bit masks. */
const BUTTON_MASK = 0b00000011; // low 2 bits = button index (0/1/2)
const SHIFT_BIT = 0b00000100;
const META_BIT = 0b00001000;
const CTRL_BIT = 0b00010000;
const MOTION_BIT = 0b00100000; // set when event is motion (not a click)
const WHEEL_BIT = 0b01000000; // set for wheel events (button 64/65)

/**
 * Decode a raw SGR button byte and terminator into a {@link MouseEvent}.
 * Returns `null` when the byte/coords are malformed.
 */
function toMouseEvent(
  rawButton: number,
  column: number,
  row: number,
  terminator: string,
): MouseEvent | null {
  if (!Number.isFinite(column) || !Number.isFinite(row)) return null;

  const modifiers: MouseModifiers = {
    shift: (rawButton & SHIFT_BIT) !== 0,
    meta: (rawButton & META_BIT) !== 0,
    ctrl: (rawButton & CTRL_BIT) !== 0,
  };

  const isWheel = (rawButton & WHEEL_BIT) !== 0;
  const isMotion = (rawButton & MOTION_BIT) !== 0;
  const isRelease = terminator === "m";
  const buttonIndex = rawButton & BUTTON_MASK;

  let kind: MouseEventKind;
  let button: 0 | 1 | 2 | null;

  if (isWheel) {
    // button 64 = wheel-up (rawButton & BUTTON_MASK === 0)
    // button 65 = wheel-down (rawButton & BUTTON_MASK === 1)
    kind = buttonIndex === 0 ? "wheel-up" : "wheel-down";
    button = null;
  } else if (isMotion) {
    // Motion with no button held: MOTION_BIT set, button bits = 3
    if (buttonIndex === 3) {
      kind = "move";
      button = null;
    } else {
      // Drag: button held while moving
      kind = "drag";
      button = buttonIndex as 0 | 1 | 2;
    }
  } else if (isRelease) {
    kind = "release";
    // In X10/SGR mode the button on release is the one that was pressed.
    // button bits = 3 means "any button released" (protocol limitation in
    // non-SGR mode, but SGR usually preserves the button). We accept 3 as null.
    button = buttonIndex === 3 ? null : (buttonIndex as 0 | 1 | 2);
  } else {
    kind = "press";
    button = buttonIndex as 0 | 1 | 2;
  }

  return { kind, button, column, row, modifiers };
}

/**
 * Parse all SGR (1006) mouse events bundled into a single `useInput` chunk.
 *
 * Node's stdin decoder can group several rapid mouse events into one string.
 * This function walks the chunk and returns every event found, in order.
 * Non-mouse input yields an empty array (fast-path via prefix check).
 */
export function parseMouseEvents(input: string): readonly MouseEvent[] {
  if (input.length === 0) return [];
  if (!input.includes(SGR_MOUSE_PREFIX)) return [];

  const events: MouseEvent[] = [];
  SGR_MOUSE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SGR_MOUSE_TOKEN.exec(input)) !== null) {
    const rawButton = Number.parseInt(match[1] ?? "", 10);
    const column = Number.parseInt(match[2] ?? "", 10);
    const row = Number.parseInt(match[3] ?? "", 10);
    const terminator = match[4] ?? "";
    const event = toMouseEvent(rawButton, column, row, terminator);
    if (event !== null) events.push(event);
  }

  return events;
}

// ---------------------------------------------------------------------------
// AABB hit-testing
// ---------------------------------------------------------------------------

/**
 * Return `true` when the terminal cell (`column`, `row`) falls inside the
 * bounding box of the element referenced by `ref`.
 *
 * Coordinates follow SGR convention: **1-indexed**. The Yoga layout values
 * from `getBoundingBox` are **0-indexed**, so we convert: a SGR column of 1
 * corresponds to Yoga left of 0.
 *
 * The test is inclusive-low / exclusive-high on both axes, matching standard
 * AABB convention:
 * ```
 * left <= col0 < left + width
 * top  <= row0 < top  + height
 * ```
 * Returns `false` when the ref is not yet mounted (`ref.current` is `null`).
 */
export function isInsideRef(
  ref: React.RefObject<DOMElement | null>,
  column: number,
  row: number,
): boolean {
  const node = ref.current;
  if (!node) return false;

  const { top, left, width, height } = getBoundingBox(node);
  if (width === 0 || height === 0) return false;

  // Convert 1-indexed SGR coords to 0-indexed Yoga coords.
  const col0 = column - 1;
  const row0 = row - 1;

  return (
    col0 >= left && col0 < left + width && row0 >= top && row0 < top + height
  );
}

export { isMouseEscape, SGR_MOUSE_PREFIX, SGR_MOUSE_TAIL_PATTERN };
