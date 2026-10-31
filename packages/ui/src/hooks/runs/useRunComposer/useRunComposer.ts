import { useCallback, useState } from "react";
import { submitOutcome } from "../../../components/ChatInput";
import type { SubmitOutcome } from "../../../components/ChatInput";
import { useDaemonConnectionStatus } from "../../useCommaAgentsDaemon";
import { useDaemonMutation } from "../../useDaemonMutation";
import { useRunControls, useRunFeed } from "../RunProvider/RunProvider.context";
import type { RunComposer } from "./useRunComposer.types";
import {
  canSubmitMessage,
  composerMode,
  composerRecipients,
  pickRecipient,
} from "./useRunComposer.utils";

const NO_RECIPIENT: SubmitOutcome = {
  ok: false,
  message: "Choose an available recipient before sending.",
};

/**
 * Route a message to the followed run: continue it, reply to a waiting agent, or steer a working one.
 * @returns {RunComposer} Mode, recipients, and a submit action that never rejects.
 */
export function useRunComposer(): RunComposer {
  const [chosenId, selectRecipient] = useState("");
  const feed = useRunFeed();
  const { runId, submission, strategy, stop } = useRunControls();
  const connected = useDaemonConnectionStatus() === "connected";
  const { attempt: reply } = useDaemonMutation("runs.resolveInput");
  const { attempt: steer } = useDaemonMutation("runs.steer");
  const mode = composerMode(feed);
  const recipients = composerRecipients(feed, mode);
  const recipient = pickRecipient(recipients, chosenId);
  const canSubmit = canSubmitMessage({
    mode,
    initialized: feed.initialized,
    connected,
    busy: strategy.isLoading || stop.isStopping,
    strategyAvailable: strategy.selected !== undefined,
    recipient,
  });
  const { send } = submission;
  const submit = useCallback(
    async (text: string): Promise<SubmitOutcome> => {
      if (!canSubmit) return NO_RECIPIENT;
      if (mode === "continue") return send(text);
      if (!recipient) return NO_RECIPIENT;
      return submitOutcome(
        mode === "reply"
          ? await reply({ runId, inputId: recipient.id, text })
          : await steer({ runId, messageId: recipient.id, text }),
      );
    },
    [canSubmit, mode, recipient, send, reply, steer, runId],
  );
  return { mode, recipients, recipient, selectRecipient, canSubmit, submit };
}
