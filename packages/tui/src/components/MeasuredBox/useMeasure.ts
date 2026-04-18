import { type DOMElement, measureElement, useStdout } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";

/** Dimensions returned by the measurement. */
export interface MeasuredDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Hook that measures the dimensions of an ink `<Box>` element.
 *
 * Returns a `ref` to attach to the `<Box>` and the measured `{ width, height }`.
 * Re-measures automatically when the terminal is resized.
 *
 * @example
 * ```tsx
 * const { ref, dimensions } = useMeasure();
 * return (
 *   <Box ref={ref} width="100%">
 *     <Text>Width is {dimensions.width}</Text>
 *   </Box>
 * );
 * ```
 */
export function useMeasure() {
  const ref = useRef<DOMElement>(null);
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState<MeasuredDimensions>({
    width: 0,
    height: 0,
  });

  const measure = useCallback(() => {
    if (ref.current) {
      const measured = measureElement(ref.current);
      setDimensions((prev) => {
        if (prev.width === measured.width && prev.height === measured.height) {
          return prev;
        }
        return { width: measured.width, height: measured.height };
      });
    }
  }, []);

  // Measure after initial render.
  useEffect(() => {
    measure();
  }, [measure]);

  // Re-measure on terminal resize.
  useEffect(() => {
    if (!stdout) return;
    stdout.on("resize", measure);
    return () => {
      stdout.off("resize", measure);
    };
  }, [stdout, measure]);

  return { ref, dimensions } as const;
}
