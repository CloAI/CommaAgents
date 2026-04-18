import { type DOMElement, useStdout } from "ink";
import { useEffect, useRef } from "react";
import { DEBUG_RENDER } from "../utils/debug";
import {
  CURSOR_RESTORE,
  CURSOR_SAVE,
  cursorTo,
  getAbsolutePosition,
} from "./useRegion/useRegion.utils";

/**
 * How long the colored highlight stays visible before being cleared.
 * Must be short enough to not stack up during rapid re-renders.
 */
const FLASH_DURATION_MS = 200;

// ── Render reasons ─────────────────────────────────────────────────

/**
 * Every detectable reason a component rendered.
 * Multiple can be true simultaneously (e.g. props changed *and* rerender).
 */
export type RenderReason = "mount" | "unmount" | "props" | "state" | "context" | "rerender";

// ── Default color palette ──────────────────────────────────────────

/** ANSI SGR background-only codes for the full-region tint. */
const DEFAULT_BG: Record<RenderReason, string> = {
  mount: "\x1b[46m",    // cyan bg
  unmount: "\x1b[41m",  // red bg
  props: "\x1b[45m",    // magenta bg
  state: "\x1b[42m",    // green bg
  context: "\x1b[47m",  // white bg
  rerender: "\x1b[43m", // yellow bg
};

/** ANSI SGR codes for each label pill (background + contrasting foreground). */
const DEFAULT_LABEL: Record<RenderReason, string> = {
  mount: "\x1b[46;30m",    // cyan bg, black fg
  unmount: "\x1b[41;37m",  // red bg, white fg
  props: "\x1b[45;37m",    // magenta bg, white fg
  state: "\x1b[42;30m",    // green bg, black fg
  context: "\x1b[47;30m",  // white bg, black fg
  rerender: "\x1b[43;30m", // yellow bg, black fg
};

const RESET = "\x1b[0m";

// ── Options / public types ─────────────────────────────────────────

/**
 * Custom ANSI SGR color strings keyed by render reason.
 * Any reason not specified falls back to the built-in default.
 *
 * Each value should be a raw SGR sequence like `"\x1b[48;5;208m"` (bg only)
 * or `"\x1b[48;5;208;30m"` (bg + fg).
 */
export interface DebugRenderColors {
  /** Background-only SGR for the full-region tint. */
  readonly bg?: Partial<Record<RenderReason, string>>;
  /** Background + foreground SGR for the label pill. */
  readonly label?: Partial<Record<RenderReason, string>>;
}

/** Configuration for `useDebugRender`. */
export interface DebugRenderOptions {
  /**
   * The component's current props object.
   * Passed each render so the hook can shallow-diff to detect prop changes.
   */
  readonly props?: Record<string, unknown>;
  /**
   * Override the default color palette for this component.
   * Useful for distinguishing specific components at a glance.
   */
  readonly colors?: DebugRenderColors;
  /**
   * Flash duration override in milliseconds.
   * Defaults to 200ms.
   */
  readonly flashMs?: number;
}

/** Ref handle returned by `useDebugRender`. Attach to the root `<Box>`. */
export interface DebugRenderRef {
  readonly ref: React.RefCallback<DOMElement>;
}

// ── Label helpers ──────────────────────────────────────────────────

/**
 * Build one ANSI-colored pill for a single reason.
 * Example visible: ` props `
 */
function buildPill(reason: RenderReason, labelSgr: string): string {
  return `${labelSgr} ${reason} ${RESET}`;
}

/**
 * Build the full label line: component name, render count, then a
 * colored pill for *every* detected reason.
 *
 * Example visible: ` Frame #4  props  state  rerender `
 */
function buildLabelLine(
  name: string,
  count: number,
  reasons: readonly RenderReason[],
  labelColors: Record<RenderReason, string>,
): string {
  const header = `\x1b[1m ${name} #${String(count)} ${RESET}`;
  const pills = reasons.map((r) => buildPill(r, labelColors[r])).join(" ");
  return `${header} ${pills}`;
}

/** Visible character width of the full label line (for clearing). */
function labelLineVisibleWidth(
  name: string,
  count: number,
  reasons: readonly RenderReason[],
): number {
  // " {name} #{count} " + for each reason: " " + " {reason} "
  let width = name.length + String(count).length + 5;
  for (const r of reasons) {
    width += r.length + 4; // " {reason} " + gap
  }
  return width;
}

// ── Bounding box helpers ───────────────────────────────────────────

function getBoundingBox(node: DOMElement): {
  top: number;
  left: number;
  width: number;
  height: number;
} {
  const { top, left } = getAbsolutePosition(node);
  const yoga = node.yogaNode;
  const width = yoga ? yoga.getComputedWidth() : 0;
  const height = yoga ? yoga.getComputedHeight() : 0;
  return { top, left, width, height };
}

// ── Painting ───────────────────────────────────────────────────────

/**
 * Paint the full bounding box with the primary reason's background
 * tint, then overdraw the stacked label line on the first row.
 */
function paintHighlight(
  stdout: NodeJS.WriteStream,
  node: DOMElement,
  reasons: readonly RenderReason[],
  labelLine: string,
  bgColors: Record<RenderReason, string>,
): void {
  const { top, left, width, height } = getBoundingBox(node);
  if (width === 0 || height === 0) return;

  // Use the first (highest-priority) reason for the region tint.
  const bg = bgColors[reasons[0] ?? "rerender"];
  let output = CURSOR_SAVE;

  for (let row = 0; row < height; row++) {
    output += cursorTo(top + row + 1, left + 1);
    output += `${bg}${" ".repeat(width)}${RESET}`;
  }

  // Overdraw the label on the first row.
  output += cursorTo(top + 1, left + 1);
  output += labelLine;

  output += CURSOR_RESTORE;
  stdout.write(output);
}

function clearLabelLine(
  stdout: NodeJS.WriteStream,
  node: DOMElement,
  visibleWidth: number,
): void {
  const { top, left } = getAbsolutePosition(node);
  const blanks = " ".repeat(visibleWidth);
  stdout.write(`${CURSOR_SAVE}${cursorTo(top + 1, left + 1)}${blanks}${CURSOR_RESTORE}`);
}

function clearHighlight(stdout: NodeJS.WriteStream, node: DOMElement): void {
  const { top, left, width, height } = getBoundingBox(node);
  if (width === 0 || height === 0) return;

  let output = CURSOR_SAVE;
  for (let row = 0; row < height; row++) {
    output += cursorTo(top + row + 1, left + 1);
    output += " ".repeat(width);
  }
  output += CURSOR_RESTORE;
  stdout.write(output);
}

// ── Reason detection ───────────────────────────────────────────────

/**
 * Collect *all* applicable reasons for this render cycle.
 * Returns them sorted by priority (most specific first).
 */
function detectReasons(
  isMounted: boolean,
  props: Record<string, unknown> | undefined,
  prevProps: Record<string, unknown> | undefined,
): RenderReason[] {
  const reasons: RenderReason[] = [];

  if (!isMounted) {
    reasons.push("mount");
    // Mount always implies a rerender.
    reasons.push("rerender");
    return reasons;
  }

  // Check prop changes.
  let propsChanged = false;
  if (props && prevProps) {
    const allKeys = Object.keys({ ...prevProps, ...props });
    propsChanged = allKeys.some((key) => !Object.is(prevProps[key], props[key]));
    if (propsChanged) {
      reasons.push("props");
    }
  }

  // If no prop diff detected but something triggered a render,
  // determine whether it's state or context.
  if (!propsChanged) {
    if (props) {
      // Props were tracked and didn't change.
      // If the component has local state, this is "state".
      // If it's a pure renderer, it's likely "context".
      // We default to "state" — components that are pure renderers
      // with no local state should rarely re-render without prop changes
      // unless context changed.
      reasons.push("state");
    } else {
      // No props tracked — can't distinguish, mark as context.
      reasons.push("context");
    }
  }

  // Every render is also a rerender.
  reasons.push("rerender");

  return reasons;
}

// ── Merged color maps ──────────────────────────────────────────────

function mergeBg(overrides?: Partial<Record<RenderReason, string>>): Record<RenderReason, string> {
  if (!overrides) return DEFAULT_BG;
  return { ...DEFAULT_BG, ...overrides };
}

function mergeLabel(
  overrides?: Partial<Record<RenderReason, string>>,
): Record<RenderReason, string> {
  if (!overrides) return DEFAULT_LABEL;
  return { ...DEFAULT_LABEL, ...overrides };
}

// ── Hook ───────────────────────────────────────────────────────────

/**
 * Attaches a cursor-drawn debug overlay to a component that briefly
 * highlights the entire bounding box with a colored background tint
 * and draws a label showing *all* detected render reasons as pills.
 *
 * Returns a `ref` callback to attach to the component's root `<Box>`.
 * When `DEBUG_RENDER` is `false` the ref is a no-op and no effects run.
 *
 * Default color legend:
 * - **Cyan**    — mount (first render)
 * - **Red**     — unmount
 * - **Magenta** — props changed
 * - **Green**   — state changed (no prop diff detected)
 * - **White**   — context changed (no prop/state diff)
 * - **Yellow**  — generic re-render (always present)
 *
 * @param label   - Component name shown in the overlay.
 * @param options - Props for diffing, custom colors, flash duration.
 *
 * @example
 * ```tsx
 * // Basic usage — pass props for diff detection:
 * const debug = useDebugRender("MyComponent", { props: { count, name } });
 * return <Box ref={debug.ref}>…</Box>;
 *
 * // Custom colors — orange tint for props changes:
 * const debug = useDebugRender("HotPath", {
 *   props: { data },
 *   colors: {
 *     bg:    { props: "\x1b[48;5;208m" },
 *     label: { props: "\x1b[48;5;208;30m" },
 *   },
 * });
 * ```
 */
export function useDebugRender(label: string, options?: DebugRenderOptions): DebugRenderRef {
  const { stdout } = useStdout();
  const nodeRef = useRef<DOMElement | null>(null);
  const renderCount = useRef(0);
  const prevPropsRef = useRef<Record<string, unknown> | undefined>(undefined);
  const mountedRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refCallback = useRef((el: DOMElement | null) => {
    nodeRef.current = el;
  }).current;

  renderCount.current += 1;

  const props = options?.props;
  const flashMs = options?.flashMs ?? FLASH_DURATION_MS;
  const bgColors = mergeBg(options?.colors?.bg);
  const labelColors = mergeLabel(options?.colors?.label);

  // ── Detect all reasons ───────────────────────────────────────────
  const reasons = detectReasons(mountedRef.current, props, prevPropsRef.current);
  prevPropsRef.current = props ? { ...props } : undefined;

  // ── Paint / clear ────────────────────────────────────────────────
  useEffect(() => {
    if (!DEBUG_RENDER) return;
    mountedRef.current = true;

    const target = stdout ?? process.stdout;
    const node = nodeRef.current;
    if (!node) return;

    const line = buildLabelLine(label, renderCount.current, reasons, labelColors);
    const visWidth = labelLineVisibleWidth(label, renderCount.current, reasons);

    if (flashTimerRef.current !== null) {
      clearTimeout(flashTimerRef.current);
    }

    // Defer so Ink finishes its synchronous repaint first.
    setTimeout(() => {
      paintHighlight(target, node, reasons, line, bgColors);
    }, 0);

    flashTimerRef.current = setTimeout(() => {
      clearLabelLine(target, node, visWidth);
      flashTimerRef.current = null;
    }, flashMs);

    return () => {
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  });

  // ── Unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!DEBUG_RENDER) return;

    return () => {
      const target = stdout ?? process.stdout;
      const node = nodeRef.current;
      if (!node) return;

      const unmountReasons: RenderReason[] = ["unmount"];
      const line = buildLabelLine(label, renderCount.current, unmountReasons, labelColors);
      paintHighlight(target, node, unmountReasons, line, bgColors);

      setTimeout(() => {
        clearHighlight(target, node);
      }, flashMs);
    };
  }, [label, stdout, flashMs, bgColors, labelColors]);

  return { ref: refCallback };
}
