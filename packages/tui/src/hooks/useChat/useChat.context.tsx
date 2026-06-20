import { createContext, useMemo, useState } from "react";

import type {
  ChatRun,
  ChatRunId,
  ChatRunsContextProviderProps,
  ChatRunsStore,
} from "./useChat.types";
import { useChatAgentMessages } from "./useChatAgentMessages";
import { useChatInputRequests } from "./useChatInputRequests";
import { useChatPermissionRequestSubscriptions } from "./useChatPermissionRequests/useChatPermissionRequestSubscriptions";
import { useChatQuestionRequestSubscriptions } from "./useChatQuestionRequests/useChatQuestionRequestSubscriptions";
import { useChatRunLifecycleSubscriptions } from "./useChatRunLifecycle/useChatRunLifecycleSubscriptions";
import { useChatSteering } from "./useChatSteering";
import { useChatStepMessages } from "./useChatStepMessages";

export const ChatRunsContext = createContext<ChatRunsStore | null>(null);

function ChatRunSubscriptions(): null {
  useChatRunLifecycleSubscriptions();
  useChatInputRequests(true);
  useChatSteering(true);
  useChatPermissionRequestSubscriptions();
  useChatQuestionRequestSubscriptions();
  useChatAgentMessages();
  useChatStepMessages();
  return null;
}

/**
 * Provide global chat-run state and compose the hooks that own each logical
 * block of run behavior.
 */
export function ChatRunsContextProvider({
  children,
}: ChatRunsContextProviderProps): React.ReactElement {
  const [chatRuns, setChatRuns] = useState<ReadonlyMap<ChatRunId, ChatRun>>(
    () => new Map(),
  );

  const contextValue = useMemo<ChatRunsStore>(
    () => ({
      chatRuns,
      setChatRuns,
    }),
    [chatRuns],
  );

  return (
    <ChatRunsContext.Provider value={contextValue}>
      <ChatRunSubscriptions />
      {children}
    </ChatRunsContext.Provider>
  );
}
