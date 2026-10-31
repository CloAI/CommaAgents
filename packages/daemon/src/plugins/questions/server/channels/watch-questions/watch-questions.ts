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
/** Pending questions of a run and its subagents: current ones on open, then each new and ended one. */
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
    const stopResolved = await plugin.notifications.subscribe(
      "run_question_resolved",
      runId,
      ({ runId: questionRunId, requestId }) =>
        channel.send({
          type: "question.resolved",
          data: { runId: questionRunId, requestId },
        }),
    );
    const stopRequested = await plugin.notifications.subscribe(
      "run_question_requested",
      runId,
      ({ type: _type, ...question }) =>
        channel.send({ type: "question.requested", data: question }),
    );
    return {
      cleanup: () => {
        stopRequested();
        stopResolved();
      },
    };
  },
});
