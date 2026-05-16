import { useEffect, useState } from "react";

/**
 * Spinner glyph rotation used to indicate an in-flight tool call.
 *
 * Four-frame Braille-style rotation chosen for legibility on dark and
 * light terminals while staying single-cell wide so it can sit at the
 * head of a tool-call row without disturbing column alignment.
 */
export const TOOL_SPINNER_FRAMES = [
  "\u25DC",
  "\u25DD",
  "\u25DE",
  "\u25DF",
] as const;

/**
 * Animation interval in milliseconds. 120ms gives a perceptibly active
 * spin without burning frames or causing terminals to drop redraws.
 */
export const TOOL_SPINNER_INTERVAL_MS = 120;

/**
 * Module-scoped tick counter. A single shared `setInterval` ticks all
 * running tool calls in lockstep, regardless of how many `ToolCallView`
 * instances are mounted. Sharing the interval keeps re-renders aligned
 * to a common clock and avoids spawning one timer per tool call (which
 * would degrade quickly during multi-tool fan-out).
 */
let sharedTickCount = 0;

/**
 * Set of subscriber callbacks. The interval is started when the first
 * subscriber registers and torn down when the last one unsubscribes,
 * so the timer never runs during idle periods (no in-flight calls).
 */
const subscribers: Set<(tick: number) => void> = new Set();

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function ensureIntervalRunning(): void {
  if (intervalHandle !== null) return;
  intervalHandle = setInterval(() => {
    sharedTickCount = (sharedTickCount + 1) % TOOL_SPINNER_FRAMES.length;
    for (const notify of subscribers) {
      notify(sharedTickCount);
    }
  }, TOOL_SPINNER_INTERVAL_MS);
}

function maybeStopInterval(): void {
  if (intervalHandle !== null && subscribers.size === 0) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    sharedTickCount = 0;
  }
}

/**
 * Returns the current tool-spinner frame.
 *
 * - When `running` is `false`, the hook returns `null` and never
 *   subscribes to the shared tick — components rendering completed or
 *   errored tool calls pay zero re-render cost.
 * - When `running` is `true`, the hook subscribes to the shared tick
 *   and re-renders the consuming component every {@link
 *   TOOL_SPINNER_INTERVAL_MS} ms with the next frame from {@link
 *   TOOL_SPINNER_FRAMES}.
 *
 * The shared interval is reference-counted: it starts when the first
 * subscriber mounts and stops when the last one unmounts.
 */
export function useToolSpinner(running: boolean): string | null {
  const [tick, setTick] = useState(sharedTickCount);

  useEffect(() => {
    if (!running) return;

    subscribers.add(setTick);
    ensureIntervalRunning();
    // Snap the consumer to the current shared tick so a freshly
    // mounted spinner aligns with already-running ones.
    setTick(sharedTickCount);

    return () => {
      subscribers.delete(setTick);
      maybeStopInterval();
    };
  }, [running]);

  if (!running) return null;
  return TOOL_SPINNER_FRAMES[tick] ?? TOOL_SPINNER_FRAMES[0];
}
