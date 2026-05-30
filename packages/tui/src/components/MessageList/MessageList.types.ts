import type { InkBoxProps } from "ink";

import type { ChatMessage } from "../../hooks/useChat/useChat.types";

export interface MessageListProps {
  /** Messages to render in chronological order. */
  readonly messages: readonly ChatMessage[];
}

export interface MessageListRenderProps {
  /** Messages to render in chronological order. */
  readonly messages: readonly GroupedChatMessage[];
  /** Debug render ref from useDebugRender. */
  readonly debugRef: React.RefObject<HTMLElement>;
  /** Props for the outer container Box. */
  readonly containerProps: InkBoxProps;
  /** Props for the empty state container Box. */
  readonly emptyStateProps: InkBoxProps;
  /** Props for the empty state Text. */
  readonly emptyStateTextProps: Omit<InkBoxProps, "children">;
}

export interface GroupedChatMessage extends ChatMessage {
  /** Messages spawned by a `launch_strategy` tool call inside this message. */
  readonly subMessages: readonly GroupedChatMessage[];
}
