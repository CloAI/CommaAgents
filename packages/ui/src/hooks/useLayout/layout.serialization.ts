import { listPanes, normalize } from "./layout";
import type { Layout, LayoutNode } from "./layout.types";

/**
 * Check that a decoded value is a plain object.
 * @param {unknown} value - Decoded browser data.
 * @returns {boolean} Whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rebuild a node from decoded data, rejecting anything malformed or with repeated IDs.
 * @param {unknown} value - Decoded node.
 * @param {Set<string>} seen - Identifiers used so far.
 * @returns {LayoutNode | undefined} The node, or undefined when invalid.
 */
function readNode(value: unknown, seen: Set<string>): LayoutNode | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "") {
    return undefined;
  }
  if (seen.has(value.id)) {
    return undefined;
  }
  seen.add(value.id);
  if (value.type === "pane") {
    return typeof value.path === "string" && value.path.startsWith("/")
      ? { type: "pane", id: value.id, path: value.path }
      : undefined;
  }
  if (
    value.type !== "split" ||
    (value.direction !== "row" && value.direction !== "column") ||
    !Array.isArray(value.children) ||
    value.children.length === 1
  ) {
    return undefined;
  }
  const children: LayoutNode[] = [];
  for (const child of value.children) {
    const node = readNode(child, seen);
    if (!node) {
      return undefined;
    }
    children.push(node);
  }
  const sizes =
    Array.isArray(value.sizes) &&
    value.sizes.length === children.length &&
    value.sizes.every(
      (size): size is number =>
        typeof size === "number" && Number.isFinite(size) && size > 0,
    )
      ? value.sizes
      : undefined;
  return {
    type: "split",
    id: value.id,
    direction: value.direction,
    children,
    ...(sizes ? { sizes } : {}),
  };
}

/**
 * Decode a saved layout, tolerating a stale focus but nothing structurally wrong.
 * @param {string} text - Stored JSON.
 * @returns {Layout | undefined} The layout, or undefined when it is invalid or unsupported.
 */
export function parseLayout(text: string): Layout | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.version !== 1) {
    return undefined;
  }
  const root = readNode(value.root, new Set());
  if (!root) {
    return undefined;
  }
  const tidy = normalize(root);
  const panes = listPanes(tidy);
  const activeId =
    typeof value.activeId === "string" &&
    panes.some((pane) => pane.id === value.activeId)
      ? value.activeId
      : (panes[0]?.id ?? "");
  return { root: tidy, activeId };
}

/**
 * Encode a layout for storage.
 * @param {Layout} layout - Layout to save.
 * @returns {string} Versioned JSON.
 */
export function serializeLayout(layout: Layout): string {
  return JSON.stringify({ version: 1, ...layout });
}
