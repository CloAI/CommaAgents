import type { ChatRunId, UseChatState } from "./useChat.types";
import { useChatActions } from "./useChatActions";
import { useChatLifecycle } from "./useChatLifecycle";
import { useChatState } from "./useChatState";

/**
 * Bind a view to a single chat run.
 *
 * When no matching run exists, the returned view exposes empty values;
 * `startStrategy` is still functional and will create a new run.
 *
 * Must be called inside both a `<DaemonContextProvider>` and a
 * `<ChatRunsContextProvider>`.
 */
export function useChat(chatRunId: ChatRunId | null): UseChatState {
  const state = useChatState(chatRunId);
  const actions = useChatActions(chatRunId);
  const lifecycle = useChatLifecycle();

  return {
    ...state,
    ...actions,
    ...lifecycle,
  };
}
