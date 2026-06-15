import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import { useChatRunStore } from "../useChatRunStore";

/** Project daemon questions into local chat runs. */
export function useChatQuestionRequestSubscriptions(): void {
  const { setChatRuns } = useChatRunStore();

  useDaemonSubscription("request_question", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(message.runId, {
        ...chatRun,
        status: "waiting_question",
        pendingQuestionRequests: [...chatRun.pendingQuestionRequests, message],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });
}
