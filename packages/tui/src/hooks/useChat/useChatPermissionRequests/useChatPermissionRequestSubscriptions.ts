import { useDaemonSubscription } from "../../useDaemon/useDaemonSubscription/useDaemonSubscription";
import { useChatRunStore } from "../useChatRunStore";

/** Project daemon permission requests into local chat runs. */
export function useChatPermissionRequestSubscriptions(): void {
  const { setChatRuns } = useChatRunStore();

  useDaemonSubscription("request_permission", (message) => {
    setChatRuns((previousChatRuns) => {
      const chatRun = previousChatRuns.get(message.runId);
      if (!chatRun) return previousChatRuns;
      const nextChatRuns = new Map(previousChatRuns);
      nextChatRuns.set(message.runId, {
        ...chatRun,
        status: "waiting_permission",
        pendingPermissionRequests: [
          ...chatRun.pendingPermissionRequests,
          message,
        ],
        updatedAt: Date.now(),
      });
      return nextChatRuns;
    });
  });

  useDaemonSubscription("policy_updated", (_message) => {
    // Decisions dequeue requests immediately. Policy updates are informational.
  });
}
