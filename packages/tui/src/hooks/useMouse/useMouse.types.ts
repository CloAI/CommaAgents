/**
 * The kind of SGR mouse event received from the terminal.
 *
 * - `"press"`      — button pressed (terminator `M`, non-wheel, non-motion).
 * - `"release"`    — button released (terminator `m`, non-wheel).
 * - `"move"`       — cursor motion with no button held (requires `?1003h`).
 * - `"drag"`       — cursor motion while a button is held (`?1002h`/`?1003h`).
 * - `"wheel-up"`   — mouse wheel scrolled up (button 64).
 * - `"wheel-down"` — mouse wheel scrolled down (button 65).
 */
export type MouseEventKind = "press" | "release" | "move" | "drag" | "wheel-up" | "wheel-down";

/**
 * Keyboard modifier keys held at the time of a mouse event.
 * Encoded in the SGR button byte: shift=bit2, meta=bit3, ctrl=bit4.
 */
export interface MouseModifiers {
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}

/**
 * A single parsed SGR (1006) mouse event.
 *
 * Coordinates are **1-indexed absolute terminal cells**, matching the
 * values emitted by the terminal. Column 1 is the leftmost column;
 * row 1 is the topmost row.
 */
export interface MouseEvent {
  /** What kind of event this is. */
  readonly kind: MouseEventKind;
  /**
   * Which mouse button triggered the event.
   * `0` = left, `1` = middle, `2` = right.
   * `null` for motion-without-button and wheel events.
   */
  readonly button: 0 | 1 | 2 | null;
  /** 1-indexed column (horizontal position) in terminal cells. */
  readonly column: number;
  /** 1-indexed row (vertical position) in terminal cells. */
  readonly row: number;
  /** Keyboard modifiers held at the time of the event. */
  readonly modifiers: MouseModifiers;
}
