/** Clamp a selected index to the valid range for a list length. */
export function clampIndex(index: number, length: number): number {
  if (length <= 0 || index < 0) return 0;
  return Math.min(index, length - 1);
}
