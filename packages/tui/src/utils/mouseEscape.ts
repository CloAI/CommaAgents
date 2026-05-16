/**
 * SGR (1006) mouse escape prefix, as forwarded by Ink's `useInput` after
 * the leading `\x1b` has been stripped: `[<`
 */
export const SGR_MOUSE_PREFIX = "[<";

/**
 * Tail-fragment heuristic: a run of digits, semicolons, and an optional
 * trailing `M`/`m`. When Ink's CSI parser consumes the `\x1b[<` opener
 * but the rest of the event arrives on a later read, the tail looks like
 * `5;47;30M`. Requires at least one `;` so plain numeric typing isn't
 * swallowed.
 */
export const SGR_MOUSE_TAIL_PATTERN = /^[\d;]+[Mm]?$/;

/**
 * Returns `true` when `input` looks like an SGR mouse escape sequence (or a
 * fragment thereof) and should be swallowed by text-consuming inputs before
 * they treat the chunk as typed characters.
 *
 * Matches:
 * - Complete SGR sequence: `[<BTN;COL;ROW(M|m)`
 * - Several concatenated sequences
 * - A partial sequence starting with `[<`
 * - A tail fragment like `5;47;30M`
 *
 * Deliberately permissive: the `[<` opener and the tail shape are vanishingly
 * unlikely in real typing, and it is better to occasionally swallow an exotic
 * keystroke than to let mouse noise leak into a text input.
 */
export function isMouseEscape(input: string): boolean {
  if (input.length === 0) return false;
  if (input.startsWith(SGR_MOUSE_PREFIX)) return true;
  if (input.includes(SGR_MOUSE_PREFIX)) return true;
  if (SGR_MOUSE_TAIL_PATTERN.test(input) && input.includes(";")) return true;
  return false;
}
