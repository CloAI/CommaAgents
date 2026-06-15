import type { ChatRunsContextType } from "./useChat.types";
import { useChatRunStore } from "./useChatRunStore";

/**
 * Access shared chat run state.
 *
 * Use this when a component needs awareness of multiple runs at once
 * (e.g. a run switcher). For single-run views, prefer `useChat()`.
 *
 * Must be called inside a `<ChatRunsContextProvider>`.
 */
export function useChatRuns(): ChatRunsContextType {
  const { chatRuns } = useChatRunStore();

  return { chatRuns };
}
