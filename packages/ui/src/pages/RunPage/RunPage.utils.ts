/**
 * Decide whether a key press belongs to this run page.
 * In a pane, layout focus identifies the page; a standalone page follows DOM focus.
 * @param {HTMLElement | null} root - The run page's root element.
 * @param {Element | null} target - Element that received the key press.
 * @param {boolean} inPane - Whether the page is rendered in a layout pane.
 * @returns {boolean} Whether the press is for this page.
 */
export function isRunPageTarget(
  root: HTMLElement | null,
  target: Element | null,
  inPane: boolean,
): boolean {
  if (!root) return false;
  const targetRun = target?.closest("[data-run-page]");
  if (targetRun && targetRun !== root) return false;
  if (inPane || root.contains(target)) return true;
  const ownerDocument = root.ownerDocument;
  return (
    target === ownerDocument.body &&
    ownerDocument.querySelector("[data-run-page]") === root
  );
}
