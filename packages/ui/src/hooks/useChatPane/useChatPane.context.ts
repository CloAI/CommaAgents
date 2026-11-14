import { createContext } from "react";

/** Facts about the pane a page is rendered in. */
export interface ChatPaneContextValue {
  /** Conversation draft identity, retained when the chat changes panes. */
  readonly runId?: string;
  /** Blank-draft identity reset by New Chat while retaining the pane. */
  readonly draftId?: string;
  /** Prevent new submissions while this window stops runs for closing. */
  readonly interactionBlocked?: boolean;
  /** Keep transfers from interrupting a message submission or run start. */
  readonly setTransferPending?: (pending: boolean) => void;
  /** Identity of the pane in the layout. */
  readonly paneId: string;
}

export const ChatPaneContext = createContext<ChatPaneContextValue | null>(null);
