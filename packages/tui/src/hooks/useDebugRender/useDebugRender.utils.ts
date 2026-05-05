import type { DOMElement } from "ink";
import { getBoundingBox, getAbsolutePosition } from "../../utils/yogaLayout";
import {
  CURSOR_RESTORE,
  CURSOR_SAVE,
  cursorTo,
} from "../useRegion/useRegion.utils";
import {
  ANSI_RESET,
  BORDER_CHARS,
  DEFAULT_BG_COLORS,
  DEFAULT_LABEL_COLORS,
} from "./useDebugRender.constants";
import type { RenderReason } from "./useDebugRender.types";

export { getBoundingBox };

/** Build one ANSI-colored pill for a single reason. */
export function buildPill(reason: RenderReason, labelSgr: string): string {
  return `${labelSgr} ${reason} ${ANSI_RESET}`;
}

/**
 * Build the full label line: component name, render count, then a
 * colored pill for every detected reason.
 */
export function buildLabelLine(
  name: string,
  count: number,
  reasons: readonly RenderReason[],
  labelColors: Record<RenderReason, string>,
): string {
  const header = `\x1b[1m ${name} #${String(count)} ${ANSI_RESET}`;
  const pills = reasons.map((reason) => buildPill(reason, labelColors[reason])).join(" ");
  return `${header} ${pills}`;
}

/** Visible character width of the full label line (for clearing). */
export function labelLineVisibleWidth(
  name: string,
  count: number,
  reasons: readonly RenderReason[],
): number {
  let width = name.length + String(count).length + 5;
  for (const reason of reasons) {
    width += reason.length + 4;
  }
  return width;
}

/**
 * Draw a colored border outline around the bounding box and overlay
 * the label line on the top edge. The border is drawn with Unicode
 * box-drawing characters so existing content inside is preserved.
 */
export function paintHighlight(
  stdout: NodeJS.WriteStream,
  node: DOMElement,
  reasons: readonly RenderReason[],
  labelLine: string,
  bgColors: Record<RenderReason, string>,
  showBackground: boolean,
): void {
  const { top, left, width, height } = getBoundingBox(node);
  if (width === 0 || height === 0) return;

  let output = CURSOR_SAVE;

  if (showBackground && width >= 2 && height >= 2) {
    const color = bgColors[reasons[0] ?? "rerender"];
    const { topLeft, topRight, bottomLeft, bottomRight, horizontal, vertical } = BORDER_CHARS;
    const innerWidth = width - 2;

    // Top edge
    output += cursorTo(top + 1, left + 1);
    output += `${color}${topLeft}${horizontal.repeat(innerWidth)}${topRight}${ANSI_RESET}`;

    // Side edges
    for (let rowIndex = 1; rowIndex < height - 1; rowIndex++) {
      output += cursorTo(top + rowIndex + 1, left + 1);
      output += `${color}${vertical}${ANSI_RESET}`;
      output += cursorTo(top + rowIndex + 1, left + width);
      output += `${color}${vertical}${ANSI_RESET}`;
    }

    // Bottom edge
    output += cursorTo(top + height, left + 1);
    output += `${color}${bottomLeft}${horizontal.repeat(innerWidth)}${bottomRight}${ANSI_RESET}`;
  }

  // Label line on the top-left, offset 1 col inward
  output += cursorTo(top + 1, left + 1);
  output += labelLine;
  output += CURSOR_RESTORE;
  stdout.write(output);
}

/** Clear just the label text on the first row. */
export function clearLabelLine(
  stdout: NodeJS.WriteStream,
  node: DOMElement,
  visibleWidth: number,
): void {
  const { top, left } = getAbsolutePosition(node);
  const blanks = " ".repeat(visibleWidth);
  stdout.write(`${CURSOR_SAVE}${cursorTo(top + 1, left + 1)}${blanks}${CURSOR_RESTORE}`);
}

/** Clear the border outline by overwriting border cells with spaces. */
export function clearHighlight(stdout: NodeJS.WriteStream, node: DOMElement): void {
  const { top, left, width, height } = getBoundingBox(node);
  if (width < 2 || height < 2) return;

  let output = CURSOR_SAVE;

  // Top edge
  output += cursorTo(top + 1, left + 1);
  output += " ".repeat(width);

  // Side edges
  for (let rowIndex = 1; rowIndex < height - 1; rowIndex++) {
    output += cursorTo(top + rowIndex + 1, left + 1);
    output += " ";
    output += cursorTo(top + rowIndex + 1, left + width);
    output += " ";
  }

  // Bottom edge
  output += cursorTo(top + height, left + 1);
  output += " ".repeat(width);

  output += CURSOR_RESTORE;
  stdout.write(output);
}

/**
 * Collect all applicable reasons for this render cycle.
 * Returns them sorted by priority (most specific first).
 */
export function detectReasons(
  isMounted: boolean,
  props: Record<string, unknown> | undefined,
  previousProps: Record<string, unknown> | undefined,
): RenderReason[] {
  const reasons: RenderReason[] = [];

  if (!isMounted) {
    reasons.push("mount");
    reasons.push("rerender");
    return reasons;
  }

  let propsChanged = false;
  if (props && previousProps) {
    const allKeys = Object.keys({ ...previousProps, ...props });
    propsChanged = allKeys.some((key) => !Object.is(previousProps[key], props[key]));
    if (propsChanged) {
      reasons.push("props");
    }
  }

  if (!propsChanged) {
    if (props) {
      // Props were tracked and didn't change — likely internal state triggered the render.
      reasons.push("state");
    } else {
      // No props tracked — can't distinguish, mark as context.
      reasons.push("context");
    }
  }

  reasons.push("rerender");
  return reasons;
}

/** Remove reasons that the caller has explicitly disabled. */
export function filterReasons(
  reasons: readonly RenderReason[],
  enabled?: Partial<Record<RenderReason, boolean>>,
): RenderReason[] {
  if (!enabled) return [...reasons];
  return reasons.filter((reason) => enabled[reason] !== false);
}

/** Merge user-provided background color overrides with defaults. */
export function mergeBackgroundColors(
  overrides?: Partial<Record<RenderReason, string>>,
): Record<RenderReason, string> {
  if (!overrides) return DEFAULT_BG_COLORS;
  return { ...DEFAULT_BG_COLORS, ...overrides };
}

/** Merge user-provided label color overrides with defaults. */
export function mergeLabelColors(
  overrides?: Partial<Record<RenderReason, string>>,
): Record<RenderReason, string> {
  if (!overrides) return DEFAULT_LABEL_COLORS;
  return { ...DEFAULT_LABEL_COLORS, ...overrides };
}
