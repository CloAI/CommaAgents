import type { DOMElement } from "ink";

export type { BoundingBox } from "../../utils/yogaLayout";

/**
 * Every detectable reason a component rendered.
 * Multiple can be true simultaneously (e.g. props changed *and* rerender).
 */
export type RenderReason = "mount" | "unmount" | "props" | "state" | "context" | "rerender";

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
   * Flash duration override in milliseconds. @default 200
   */
  readonly flashMs?: number;
  /**
   * Toggle individual render-reason overlays on or off.
   * Any reason not specified defaults to `true` (enabled).
   *
   * @example
   * ```ts
   * // Only show mount and props flashes, suppress everything else
   * useDebugRender("MyComponent", {
   *   enabled: { mount: true, props: true, unmount: false, state: false, context: false, rerender: false },
   * });
   * ```
   */
  readonly enabled?: Partial<Record<RenderReason, boolean>>;
  /**
   * Whether to draw the colored border outline around the component's
   * bounding box. When `false`, only the label pills are shown.
   * @default true
   */
  readonly showBackground?: boolean;
}

/** Ref handle returned by `useDebugRender`. Attach to the root `<Box>`. */
export interface DebugRenderRef {
  readonly ref: React.RefCallback<DOMElement>;
}
