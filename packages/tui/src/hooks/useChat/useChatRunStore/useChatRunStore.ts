import { useContext } from "react";

import { ChatRunsContext } from "../useChat.context";
import type { ChatRunsStore } from "../useChat.types";

/** Access the internal writable chat run store from a chat domain hook. */
export function useChatRunStore(): ChatRunsStore {
  const chatRunsStore = useContext(ChatRunsContext);
  if (!chatRunsStore) {
    throw new Error(
      "useChatRunStore must be used within a <ChatRunsContextProvider>",
    );
  }
  return chatRunsStore;
}
