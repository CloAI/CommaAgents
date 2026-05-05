import type { ModalSize } from "./Modal";

/**
 * Resolve a {@link ModalSize} (number or `"N%"` string) against a terminal
 * dimension. Returns `undefined` for `undefined` input so callers can forward
 * it directly to Ink's `Box` for auto-sizing.
 */
export function resolveSize(
  size: ModalSize | undefined,
  terminalExtent: number,
): number | undefined {
  if (size === undefined) return undefined;
  if (typeof size === "number") return size;
  const percent = Number(size.slice(0, -1));
  if (Number.isNaN(percent)) return undefined;
  return Math.max(1, Math.floor((terminalExtent * percent) / 100));
}
