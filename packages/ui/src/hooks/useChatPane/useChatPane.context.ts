import { createContext } from "react";

/** Facts about the pane a page is rendered in. */
export interface ChatPaneContextValue {
  /** Identity of the pane in the layout. */
  readonly paneId: string;
}

export const ChatPaneContext = createContext<ChatPaneContextValue | null>(null);
