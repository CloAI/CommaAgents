import { type DOMElement, useStdout } from "ink";
import { useEffect, useRef } from "react";
import { DEBUG_RENDER } from "../../utils/debug";
import { FLASH_DURATION_MS } from "./useDebugRender.constants";
import type { DebugRenderOptions, DebugRenderRef } from "./useDebugRender.types";
import {
  buildLabelLine,
  clearHighlight,
  clearLabelLine,
  detectReasons,
  filterReasons,
  labelLineVisibleWidth,
  mergeBackgroundColors,
  mergeLabelColors,
  paintHighlight,
} from "./useDebugRender.utils";

/**
 * Attach a cursor-drawn debug overlay to a component that briefly
 * highlights the entire bounding box with a colored background tint
 * and draws a label showing all detected render reasons as pills.
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
 * const debug = useDebugRender("MyComponent", { props: { count, name } });
 * return <Box ref={debug.ref}>content</Box>;
 *
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
  const previousPropsRef = useRef<Record<string, unknown> | undefined>(undefined);
  const mountedRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refCallback = useRef((element: DOMElement | null) => {
    nodeRef.current = element;
  }).current;

  renderCount.current += 1;

  const props = options?.props;
  const flashMs = options?.flashMs ?? FLASH_DURATION_MS;
  const enabledReasons = options?.enabled;
  const showBackground = options?.showBackground !== false;
  const backgroundColors = mergeBackgroundColors(options?.colors?.bg);
  const labelColors = mergeLabelColors(options?.colors?.label);

  const rawReasons = detectReasons(mountedRef.current, props, previousPropsRef.current);
  const reasons = filterReasons(rawReasons, enabledReasons);
  previousPropsRef.current = props ? { ...props } : undefined;

  useEffect(() => {
    if (!DEBUG_RENDER) return;
    mountedRef.current = true;

    const target = stdout ?? process.stdout;
    const node = nodeRef.current;
    if (!node || reasons.length === 0) return;

    const line = buildLabelLine(label, renderCount.current, reasons, labelColors);
    const visibleWidth = labelLineVisibleWidth(label, renderCount.current, reasons);

    if (flashTimerRef.current !== null) {
      clearTimeout(flashTimerRef.current);
    }

    // Defer so Ink finishes its synchronous repaint first.
    setTimeout(() => {
      paintHighlight(target, node, reasons, line, backgroundColors, showBackground);
    }, 0);

    flashTimerRef.current = setTimeout(() => {
      clearLabelLine(target, node, visibleWidth);
      flashTimerRef.current = null;
    }, flashMs);

    return () => {
      if (flashTimerRef.current !== null) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  });

  useEffect(() => {
    if (!DEBUG_RENDER) return;

    return () => {
      const target = stdout ?? process.stdout;
      const node = nodeRef.current;
      if (!node) return;

      const unmountReasons = filterReasons(["unmount"], enabledReasons);
      if (unmountReasons.length === 0) return;
      const line = buildLabelLine(label, renderCount.current, unmountReasons, labelColors);
      paintHighlight(target, node, unmountReasons, line, backgroundColors, showBackground);

      setTimeout(() => {
        clearHighlight(target, node);
      }, flashMs);
    };
  }, [label, stdout, flashMs, backgroundColors, labelColors, enabledReasons, showBackground]);

  return { ref: refCallback };
}
