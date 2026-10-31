import type { RefObject, UIEventHandler } from "react";

/** Elements and handler to attach for keeping a scrolling list pinned to its end. */
export interface StickToBottom {
  /** Attach to the element that scrolls. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** Attach to the single element holding the content, whose growth triggers the scroll. */
  readonly contentRef: RefObject<HTMLDivElement | null>;
  /** Attach to the scrolling element's scroll event. */
  readonly onScroll: UIEventHandler<HTMLDivElement>;
}
