import { useCallback } from "react";

import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useChatRunStore } from "../useChatRunStore";
import type { ChatPermissionRequestResult } from "./useChatPermissionRequests.types";

/** Submit decisions for pending daemon permission requests. */
export function useChatPermissionRequests(): ChatPermissionRequestResult {
  const { setChatRuns } = useChatRunStore();
  const permissionDecisionCommand = useDaemonCommand("permission_decision");

  const sendPermissionDecision = useCallback<
    ChatPermissionRequestResult["sendPermissionDecision"]
  >(
    (chatRunId, decision) => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(chatRunId);
        if (
          !chatRun?.daemonRunId ||
          chatRun.pendingPermissionRequests.length === 0
        ) {
          return previousChatRuns;
        }
        const pendingRequest = chatRun.pendingPermissionRequests[0]!;
        permissionDecisionCommand({
          runId: chatRun.daemonRunId,
          permissionRequestId: pendingRequest.requestId,
          decision,
        });
        const remainingRequests = chatRun.pendingPermissionRequests.slice(1);
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(chatRunId, {
          ...chatRun,
          status:
            remainingRequests.length > 0 ? "waiting_permission" : "running",
          pendingPermissionRequests: remainingRequests,
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
    },
    [permissionDecisionCommand, setChatRuns],
  );

  return { sendPermissionDecision };
}
