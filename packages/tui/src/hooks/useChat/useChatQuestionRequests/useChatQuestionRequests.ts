import { useCallback } from "react";

import { useDaemonCommand } from "../../useDaemon/useDaemonCommand/useDaemonCommand";
import { useChatRunStore } from "../useChatRunStore";
import type { ChatQuestionRequestResult } from "./useChatQuestionRequests.types";

/** Submit responses for pending daemon questions. */
export function useChatQuestionRequests(): ChatQuestionRequestResult {
  const { setChatRuns } = useChatRunStore();
  const questionResponseCommand = useDaemonCommand("question_response");

  const sendQuestionResponse = useCallback<
    ChatQuestionRequestResult["sendQuestionResponse"]
  >(
    (chatRunId, response) => {
      setChatRuns((previousChatRuns) => {
        const chatRun = previousChatRuns.get(chatRunId);
        if (
          !chatRun?.daemonRunId ||
          chatRun.pendingQuestionRequests.length === 0
        ) {
          return previousChatRuns;
        }
        const pendingRequest = chatRun.pendingQuestionRequests[0]!;
        questionResponseCommand({
          runId: chatRun.daemonRunId,
          questionRequestId: pendingRequest.requestId,
          response,
        });
        const remainingRequests = chatRun.pendingQuestionRequests.slice(1);
        const nextChatRuns = new Map(previousChatRuns);
        nextChatRuns.set(chatRunId, {
          ...chatRun,
          status: remainingRequests.length > 0 ? "waiting_question" : "running",
          pendingQuestionRequests: remainingRequests,
          updatedAt: Date.now(),
        });
        return nextChatRuns;
      });
    },
    [questionResponseCommand, setChatRuns],
  );

  return { sendQuestionResponse };
}
