import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDaemonMutation } from "../../useDaemonMutation";
import { useRunControls } from "../RunProvider/RunProvider.context";
import type {
  ContextChoice,
  ContextRequest,
  RunSubmission,
} from "./useRunSubmission.types";

/**
 * Own the conversation's continuation, kept pending while the user chooses context.
 * Mounted once by {@link RunProvider}; read it with {@link useRunSubmission}.
 * @param {string} runId - Conversation to continue.
 * @param {number} revision - Strategy revision shown to the user.
 * @returns {RunSubmission} Submission state and context-choice actions.
 */
export function useRunSubmissionState(
  runId: string,
  revision: number,
): RunSubmission {
  const [dialog, setDialog] = useState<ContextRequest>();
  const [isSubmitting, setSubmitting] = useState(false);
  const { attempt } = useDaemonMutation("runs.send");
  const cancelled = useRef(false);
  // Resolves with the user's choice, or undefined when they cancel.
  const decide = useRef<((choice?: ContextChoice) => void) | null>(null);
  const settle = useCallback((choice?: ContextChoice) => {
    const pending = decide.current;
    decide.current = null;
    setDialog(undefined);
    pending?.(choice);
  }, []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    settle();
  }, [settle]);
  const send = useCallback(
    async (input: string): Promise<string | undefined> => {
      cancelled.current = false;
      setSubmitting(true);
      let contextChoice: ContextChoice | undefined;
      try {
        for (;;) {
          const result = await attempt({
            runId,
            input,
            expectedRevision: revision,
            contextChoice,
          });
          if (cancelled.current) {
            return "Message preserved after the stop request.";
          }
          if (!result.ok) {
            return result.error.message;
          }
          if (result.data.type === "started") {
            return undefined;
          }
          setDialog(result.data);
          contextChoice = await new Promise<ContextChoice | undefined>(
            (resolve) => {
              decide.current = resolve;
            },
          );
          if (!contextChoice) {
            return "Message preserved. Choose context when you are ready to send.";
          }
        }
      } finally {
        settle();
        setSubmitting(false);
      }
    },
    [attempt, runId, revision, settle],
  );
  useEffect(() => () => settle(), [settle]);
  return useMemo(
    () => ({ send, dialog, choose: settle, cancel, isSubmitting }),
    [send, dialog, settle, cancel, isSubmitting],
  );
}

/**
 * Read the followed run's continuation from the enclosing {@link RunProvider}.
 * @returns {RunSubmission} Submission state and context-choice actions.
 */
export function useRunSubmission(): RunSubmission {
  return useRunControls().submission;
}
