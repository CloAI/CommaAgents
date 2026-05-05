import { type DOMElement, useStdout } from "ink";
import { useCallback, useEffect, useRef } from "react";

import type {
  RegionDimensions,
  RegionHandle,
  RegionOptions,
  RegionPosition,
} from "./useRegion.types";
import { buildRegionOutput, getAbsolutePosition } from "./useRegion.utils";

/**
 * Reserve a rectangular region in Ink's layout and write to it
 * directly via ANSI cursor positioning, bypassing Ink's renderer.
 *
 * Attach the returned `ref` to a placeholder `<Box>` with matching
 * dimensions. Then call `write(lines)` to paint content into that
 * region without triggering a React / Ink re-render.
 *
 * @example
 * ```tsx
 * const region = useRegion({ width: 40, height: 20 });
 *
 * useEffect(() => {
 *   region.write(["Hello, world!"]);
 * }, [region]);
 *
 * return <Box ref={region.ref} width={40} height={20} />;
 * ```
 */
export function useRegion(options: RegionOptions): RegionHandle {
  const { width: requestedWidth, height } = options;
  const { stdout } = useStdout();

  const ref = useRef<DOMElement>(null);

  // Store dimensions and position in refs to avoid re-renders.
  const dimensionsRef = useRef<RegionDimensions>({ width: 0, height });
  const positionRef = useRef<RegionPosition>({ top: 0, left: 0 });

  // Keep the last written lines so we can re-apply after Ink repaints.
  const lastLinesRef = useRef<readonly string[]>([]);

  /** Recompute position and dimensions from the Yoga layout tree. */
  const recalculate = useCallback(() => {
    if (!ref.current) return;

    const pos = getAbsolutePosition(ref.current);
    positionRef.current = pos;

    const yoga = ref.current.yogaNode;
    if (yoga) {
      const measuredWidth =
        requestedWidth === "auto" ? yoga.getComputedWidth() : requestedWidth;
      dimensionsRef.current = { width: measuredWidth, height };
    }
  }, [requestedWidth, height]);

  /** Write lines to stdout at the region's absolute position. */
  const write = useCallback(
    (lines: readonly string[]) => {
      lastLinesRef.current = lines;

      if (!ref.current) return;
      recalculate();

      const { top, left } = positionRef.current;
      const { width: regionWidth } = dimensionsRef.current;
      if (regionWidth === 0) return;

      const target = stdout ?? process.stdout;
      const output = buildRegionOutput(lines, top, left, regionWidth);
      target.write(output);
    },
    [stdout, recalculate],
  );

  // Re-apply the last written content after every Ink render cycle.
  // Ink erases and rewrites all output on any React state change,
  // so regions must repaint themselves afterward.
  useEffect(() => {
    if (lastLinesRef.current.length === 0) return;

    // setTimeout(0) defers until after Ink's synchronous repaint.
    const timer = setTimeout(() => {
      write(lastLinesRef.current);
    }, 0);

    return () => clearTimeout(timer);
  });

  // Recalculate on terminal resize.
  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      recalculate();
      // Re-draw with updated position / dimensions.
      if (lastLinesRef.current.length > 0) {
        write(lastLinesRef.current);
      }
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout, recalculate, write]);

  return {
    ref,
    write,
    get dimensions() {
      return dimensionsRef.current;
    },
    get position() {
      return positionRef.current;
    },
  };
}
