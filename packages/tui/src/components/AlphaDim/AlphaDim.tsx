import { Box, measureElement, useStdout, type DOMElement } from "ink";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import {
  dimFrame,
  dimIncrementalChunk,
  scaleRgb,
  type Rgb,
  type RowRange,
} from "./AlphaDim.utils";
import type { AlphaDimProps } from "./AlphaDim.types";

/** Default channel scale factor when `dimFactor` is not provided. */
const DEFAULT_DIM_FACTOR = 0.4;

/**
 * RGB used to fill cells that have no explicit background color before
 * dimming. This base value is scaled by `dimFactor` at runtime so the
 * injected default-bg tracks the overall dim level.
 */
const DEFAULT_BG_BASE: Rgb = { r: 64, g: 64, b: 64 };

/**
 * Terminal-level alpha-dim overlay with row-protected incremental rendering.
 *
 * When `isActive`, intercepts every `stdout.write` call Ink makes and dims
 * background row content while leaving the modal's row range at full
 * saturation. Works with Ink's `incrementalRendering: true` mode by
 * parsing the cursor-positioning structure of incremental chunks and
 * classifying each rewrite unit by its absolute row index.
 *
 * ### How it works
 * 1. Render the `overlay` inside a measured `<Box>` with a `ref`.
 * 2. After each layout pass, call `measureElement(ref)` to get the
 *    modal's `{width, height}`. Compute `top = floor((rows - height) / 2)`.
 * 3. Install a `stdout.write` interceptor that:
 *    - Detects incremental chunks (presence of `\x1b[<N>A` cursorUp anchor)
 *      and routes them through {@link dimIncrementalChunk}, which walks
 *      each per-row rewrite unit and only dims rows outside `[top, top+height)`.
 *    - Detects full-frame chunks (contain `\n` but no cursor escapes) and
 *      routes them through {@link dimFrame}.
 *    - Passes everything else through untouched.
 *
 * ### Frame-loop structure
 * Ink's incremental log-update writes one chunk per render shaped like:
 * ```
 *   <returnPrefix?> <eraseLines?> \x1b[<N>A     ← cursorUp to top of frame
 *   <row 0 unit> <row 1 unit> ... <row N unit>  ← exactly visibleCount units
 *   <cursorSuffix?>                              ← optional show-cursor
 * ```
 * Each row unit is either `\x1b[E` (skip — row unchanged) or
 * `\x1b[1G<line>\x1b[K\n` (rewrite row). Both advance the row index by 1,
 * so the row index is deterministic from the unit count.
 *
 * @example
 * ```tsx
 * <AlphaDim
 *   isActive={commandPalette.isOpen}
 *   dimFactor={0.4}
 *   background={<AppRender {...appProps} />}
 *   overlay={<Modal ...>...</Modal>}
 * />
 * ```
 */
export function AlphaDim({
  background,
  overlay,
  isActive,
  dimFactor = DEFAULT_DIM_FACTOR,
}: AlphaDimProps): React.ReactElement {
  const { stdout } = useStdout();
  const overlayRef = useRef<DOMElement | null>(null);
  // Track the modal row range so the stdout interceptor reads the latest
  // value via ref (avoids reinstalling the interceptor on every layout
  // change).
  const protectedRangeRef = useRef<RowRange>({ top: 0, height: 0 });
  // Trigger re-measurement after layout. Holds a render counter; bumping
  // it via setRenderTick forces measureElement to run on the new layout.
  const [, setRenderTick] = useState(0);

  // Re-measure after each render while active.
  useEffect(() => {
    if (!isActive) {
      protectedRangeRef.current = { top: 0, height: 0 };
      return;
    }
    if (!overlayRef.current) return;

    const { height } = measureElement(overlayRef.current);
    const rows = stdout?.rows ?? process.stdout.rows ?? 24;
    const top = Math.max(0, Math.floor((rows - height) / 2));
    protectedRangeRef.current = { top, height };
  });

  // Install stdout interceptor while active.
  useEffect(() => {
    if (!isActive) return;

    const target = stdout ?? process.stdout;
    const originalWrite = target.write.bind(target);
    const dimDefaultBg = scaleRgb(DEFAULT_BG_BASE, dimFactor);

    (target as NodeJS.WriteStream).write = (
      chunk: unknown,
      encodingOrCallback?: unknown,
      callback?: unknown,
    ): boolean => {
      const transformed = transformChunk(
        chunk,
        dimFactor,
        dimDefaultBg,
        protectedRangeRef.current,
      );
      return forwardWrite(
        originalWrite,
        transformed,
        chunk,
        encodingOrCallback,
        callback,
      );
    };

    // Force a re-render so measurement runs against the now-mounted overlay.
    setRenderTick((tick) => tick + 1);

    return () => {
      (target as NodeJS.WriteStream).write = originalWrite;
    };
  }, [isActive, stdout, dimFactor]);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {background}

      {isActive && (
        <Box
          position="absolute"
          width="100%"
          height="100%"
          justifyContent="center"
          alignItems="center"
          flexDirection="column"
        >
          <Box ref={overlayRef} flexDirection="column">
            {overlay}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Decide which dim transform (if any) to apply to a write chunk.
 *
 * Routing rules:
 * - Non-string chunk → no change.
 * - Chunk has `\x1b[<N>A` cursorUp anchor → incremental chunk; route to
 *   {@link dimIncrementalChunk} with the protected row range.
 * - Chunk contains `\n` and no cursor escapes (full-frame write from the
 *   non-incremental log-update path) → route to {@link dimFrame}. (Not
 *   row-protected — caller would not have ended up on this path while
 *   incremental rendering is enabled.)
 * - Anything else (control sequences, BSU/ESU, cursor moves) → no change.
 */
function transformChunk(
  chunk: unknown,
  dimFactor: number,
  dimDefaultBg: Rgb,
  protectedRange: RowRange,
): unknown {
  if (typeof chunk !== "string") return chunk;
  if (chunk.length === 0) return chunk;

  const hasCursorUp = /\x1b\[\d+A/.test(chunk);
  if (hasCursorUp) {
    const dimmed = dimIncrementalChunk(
      chunk,
      dimFactor,
      dimDefaultBg,
      protectedRange,
    );
    return dimmed ?? chunk;
  }

  if (chunk.includes("\n") && !chunk.includes("\x1b[")) {
    return dimFrame(chunk, dimFactor, dimDefaultBg);
  }

  // Mixed content with newline + escapes but no cursorUp — likely a
  // first-render full frame (Ink's standard log-update) or a clear sequence.
  // Apply full-frame dim.
  if (chunk.includes("\n")) {
    return dimFrame(chunk, dimFactor, dimDefaultBg);
  }

  return chunk;
}

/**
 * Forward a write call to the original `stdout.write`, preserving the
 * exact `(chunk, encoding, callback)` overload arity.
 */
function forwardWrite(
  originalWrite: NodeJS.WriteStream["write"],
  transformed: unknown,
  originalChunk: unknown,
  encodingOrCallback: unknown,
  callback: unknown,
): boolean {
  const payload = transformed as string;
  if (typeof encodingOrCallback === "function") {
    return originalWrite(payload, encodingOrCallback as () => void);
  }
  if (typeof callback === "function") {
    return originalWrite(
      payload,
      encodingOrCallback as BufferEncoding,
      callback as () => void,
    );
  }
  // Match the original overload when only one arg passed.
  if (encodingOrCallback === undefined) {
    return originalWrite(payload);
  }
  // Drop unused args reference — keeps lint happy without changing behavior.
  void originalChunk;
  return originalWrite(payload, encodingOrCallback as BufferEncoding);
}
