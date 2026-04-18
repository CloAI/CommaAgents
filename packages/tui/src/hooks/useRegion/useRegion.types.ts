import type { DOMElement } from "ink";
import type React from "react";

/** Configuration for a direct-write region. */
export interface RegionOptions {
  /**
   * Width of the region in columns.
   * Use `"auto"` to measure from the parent Box's Yoga layout.
   */
  readonly width: number | "auto";
  /** Height of the region in rows. */
  readonly height: number;
}

/** Measured dimensions of the region's reserved area. */
export interface RegionDimensions {
  /** Width in terminal columns. */
  readonly width: number;
  /** Height in terminal rows. */
  readonly height: number;
}

/** Absolute position of the region within the terminal. */
export interface RegionPosition {
  /** Row offset from the top of Ink's output (0-indexed). */
  readonly top: number;
  /** Column offset from the left edge (0-indexed). */
  readonly left: number;
}

/** Handle returned by `useRegion`. */
export interface RegionHandle {
  /** Ref to attach to the placeholder `<Box>`. */
  readonly ref: React.Ref<DOMElement>;
  /**
   * Write lines directly to stdout at the region's position.
   * Each element in `lines` corresponds to one terminal row.
   * Lines are truncated or padded to the region width.
   */
  readonly write: (lines: readonly string[]) => void;
  /** Current measured dimensions of the region. */
  readonly dimensions: RegionDimensions;
  /** Current absolute position of the region within Ink's output. */
  readonly position: RegionPosition;
}
