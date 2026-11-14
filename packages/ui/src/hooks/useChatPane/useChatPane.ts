import { useContext } from "react";
import { ChatPaneContext } from "./useChatPane.context";
import type { ChatPaneContextValue } from "./useChatPane.context";

/**
 * Read which pane the calling page is rendered in.
 * @returns {ChatPaneContextValue} The enclosing pane's details.
 */
export function useChatPane(): ChatPaneContextValue {
  const context = useContext(ChatPaneContext);
  if (!context) {
    throw new Error("useChatPane must be used within a ChatPane.");
  }
  return context;
}
