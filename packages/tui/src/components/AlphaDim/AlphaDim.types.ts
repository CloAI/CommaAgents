import type { DOMElement } from "ink";
import type React from "react";

/**
 * Props for {@link AlphaDim}.
 *
 * `AlphaDim` renders `background` content and, when `isActive`, intercepts
 * every `stdout.write` frame emitted by Ink and rewrites every truecolor
 * and 256-color SGR parameter to a dimmed equivalent. Cells without an
 * explicit background color are also painted with a dim default backdrop.
 * The `overlay` content is then drawn on top at full saturation via Ink's
 * normal `position:"absolute"` layout — Ink writes the overlay into the
 * same final frame string after the dim transform has already been applied
 * to the background rows, so overlay SGR codes pass through unchanged.
 */
export interface AlphaDimProps {
  /**
   * The application content rendered as the base layer. When `isActive`,
   * every cell is dimmed (foreground + background channels scaled).
   */
  readonly background: React.ReactNode;

  /**
   * The overlay content drawn on top of the dimmed background. Rendered
   * inside a full-screen `position:"absolute"` box that centers its
   * children. Only mounted when `isActive` is `true`.
   */
  readonly overlay: React.ReactNode;

  /**
   * Whether the dim + overlay are currently active. When `false`,
   * `background` renders normally and `overlay` is not mounted.
   */
  readonly isActive: boolean;

  /**
   * Channel scale factor in `(0, 1]`. Each RGB channel of every SGR color
   * (foreground and background) is multiplied by this value before being
   * written. `1` is a no-op; `0` is fully black. Default `0.4`.
   */
  readonly dimFactor?: number;
}

export interface AlphaDimRenderProps {
  /** The application content rendered as the base layer. */
  readonly background: React.ReactNode;
  /** The overlay content drawn on top of the dimmed background. */
  readonly overlay: React.ReactNode;
  /** Whether the dim + overlay are currently active. */
  readonly isActive: boolean;
  /** Ref to the overlay container for measuring its height. */
  readonly overlayRef: React.RefObject<DOMElement | null>;
}
