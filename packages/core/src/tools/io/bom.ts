/** The UTF-8 BOM as a string. */
export const BOM = "\uFEFF";

/**
 * `true` if `content` starts with the UTF-8 BOM.
 */
export function hasBom(content: string): boolean {
  return content.charCodeAt(0) === 0xfeff;
}

/**
 * Return `content` with a leading BOM removed (if present).
 */
export function stripBom(content: string): string {
  return hasBom(content) ? content.slice(1) : content;
}

/**
 * Return `content` with the BOM re-applied if `hadBom` is true. Idempotent —
 * does not double-prefix when `content` already starts with `\uFEFF`.
 */
export function applyBom(content: string, hadBom: boolean): string {
  if (!hadBom) return content;
  return hasBom(content) ? content : `${BOM}${content}`;
}
