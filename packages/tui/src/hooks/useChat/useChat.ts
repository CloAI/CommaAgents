import type { ChatRunId, UseChatState } from "./useChat.types";
import { useChatState } from "./useChatState";
import { useChatActions } from "./useChatActions";
import { useChatLifecycle } from "./useChatLifecycle";

/**
 * Bind a view to a single chat run.
 *
 * If `chatRunId` is provided, the hook observes that run. Otherwise it
 * observes the currently-active run. When no matching run exists
 * (e.g. on first mount before any strategy has been started), the returned
 * view exposes empty values; `startStrategy` is still functional and will
 * create a new run.
 *
 * Must be called inside both a `<DaemonContextProvider>` and a
 * `<ChatRunsContextProvider>`.
 */
export function useChat(chatRunId?: ChatRunId): UseChatState {
  const state = useChatState(chatRunId);
  const actions = useChatActions(chatRunId);
  const lifecycle = useChatLifecycle(chatRunId);

  return {
    ...state,
    ...actions,
    ...lifecycle,
  };
}
