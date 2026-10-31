import type {
  PendingQuestion,
  QuestionChannelMessage,
} from "./usePendingQuestions.types";

/**
 * Fold one channel event into the questions still waiting, oldest first.
 * @param {readonly PendingQuestion[]} questions - Questions waiting so far.
 * @param {QuestionChannelMessage} message - Next event from the questions channel.
 * @returns {readonly PendingQuestion[]} Updated list.
 */
export function reducePendingQuestions(
  questions: readonly PendingQuestion[],
  message: QuestionChannelMessage,
): readonly PendingQuestion[] {
  switch (message.type) {
    case "question.requested":
      return [
        ...questions.filter(
          (question) => question.requestId !== message.data.requestId,
        ),
        message.data,
      ];
    case "question.resolved":
      return questions.filter(
        (question) => question.requestId !== message.data.requestId,
      );
  }
}
