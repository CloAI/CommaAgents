import type { z } from "zod/v4";
import { defineChannel } from "../../../../../daemon-plugin";
import type {
  ChannelContext,
  CommandContext,
} from "../../../../../daemon-plugin";
import type { QuestionsPlugin } from "../../../questions.types";
import {
  WatchQuestionsArgumentsSchema,
  WatchQuestionsMessageSchema,
} from "./watch-questions.schemas";
/** Authoritative pending questionnaires on open, followed by live requests and resolutions. */
export const watchQuestionsChannel = defineChannel({
  name: "questions.watch",
  arguments: WatchQuestionsArgumentsSchema,
  message: WatchQuestionsMessageSchema,
  async open({
    plugin,
    arguments: { runId },
    channel,
  }: CommandContext<
    QuestionsPlugin,
    undefined,
    z.output<typeof WatchQuestionsArgumentsSchema>
  > & {
    readonly channel: ChannelContext<
      z.input<typeof WatchQuestionsMessageSchema>
    >;
  }) {
    let initializing = true;
    const stopResolved = await plugin.notifications.subscribe(
      "run_question_resolved",
      runId,
      ({ runId: questionRunId, requestId }) => {
        if (!initializing) {
          channel.send({
            type: "question.resolved",
            data: { runId: questionRunId, requestId },
          });
        }
      },
    );
    const stopRequested = await plugin.notifications.subscribe(
      "run_question_requested",
      runId,
      ({ type: _type, ...question }) => {
        if (initializing) {
          return;
        }
        if (
          plugin
            .getPendingQuestions(question.runId)
            .some((pending) => pending.requestId === question.requestId)
        ) {
          channel.send({ type: "question.requested", data: question });
        }
      },
    );
    const requests = plugin
      .getPendingQuestions(runId)
      .map(({ type: _type, ...request }) => request);
    initializing = false;
    return {
      initial: { type: "questions.snapshot" as const, data: { requests } },
      cleanup: () => {
        stopRequested();
        stopResolved();
      },
    };
  },
});
