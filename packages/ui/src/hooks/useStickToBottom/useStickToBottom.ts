import { useCallback, useEffect, useRef } from "react";
import { BOTTOM_THRESHOLD_PX } from "./useStickToBottom.constants";
import type { StickToBottom } from "./useStickToBottom.types";

/**
 * Keep a scrolling list at its end while the reader is at the end, and leave it alone once they scroll up.
 * Scrolling back to the bottom resumes following.
 * @returns {StickToBottom} Refs for the scroller and its content, and the scroll handler.
 * @example
 * const { scrollRef, contentRef, onScroll } = useStickToBottom();
 */
export function useStickToBottom(): StickToBottom {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const onScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    following.current =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <=
      BOTTOM_THRESHOLD_PX;
  }, []);
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    // Observing the content catches growth that React state alone misses, such as markdown replacing plain text.
    const observer = new ResizeObserver(() => {
      if (following.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  return { scrollRef, contentRef, onScroll };
}
