import type { ChatRunId } from "../useChat.types";

export interface ChatQuestionRequestResult {
  readonly sendQuestionResponse: (
    chatRunId: ChatRunId,
    response: string,
  ) => void;
}
