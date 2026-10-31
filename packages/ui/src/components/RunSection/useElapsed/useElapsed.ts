import { useEffect, useState } from "react";

const TICK_INTERVAL_MS = 1000;

/**
 * Measure how long a response took, counting up each second while it is still streaming.
 * @param {string} createdAt - When the response started, as an ISO timestamp.
 * @param {string | undefined} completedAt - When it ended, once it has.
 * @param {boolean} streaming - Whether more content may still arrive.
 * @returns {number | undefined} Milliseconds, or undefined for a finished response with no end time.
 * @example
 * const elapsed = useElapsed(message.createdAt, message.completedAt, message.streaming);
 */
export function useElapsed(
  createdAt: string,
  completedAt: string | undefined,
  streaming: boolean,
): number | undefined {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [streaming]);
  if (streaming) return Math.max(0, now - Date.parse(createdAt));
  return completedAt === undefined
    ? undefined
    : Date.parse(completedAt) - Date.parse(createdAt);
}
