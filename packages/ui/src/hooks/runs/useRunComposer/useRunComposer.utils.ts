import type { RunFeed } from "../useRunChannel";
import type {
  ComposerGate,
  ComposerMode,
  ComposerRecipient,
} from "./useRunComposer.types";

/**
 * Decide what a message does: a finished run keeps its conversation, so a message continues it.
 * @param {RunFeed} feed - Followed run.
 * @returns {ComposerMode} Continue, reply to a waiting agent, or steer a working one.
 */
export function composerMode({ status, pendingInputs }: RunFeed): ComposerMode {
  if (status !== "running") {
    return "continue";
  }
  return pendingInputs.length > 0 ? "reply" : "steer";
}

/**
 * List the agents a message can go to in this mode.
 * @param {RunFeed} feed - Followed run.
 * @param {ComposerMode} mode - What the message does.
 * @returns {ComposerRecipient[]} Waiting agents when replying, working ones when steering.
 */
export function composerRecipients(
  { pendingInputs, activeAgents }: RunFeed,
  mode: ComposerMode,
): ComposerRecipient[] {
  if (mode === "reply") {
    return pendingInputs.map(({ inputId, agentName }) => ({
      id: inputId,
      name: agentName,
    }));
  }
  if (mode === "steer") {
    return activeAgents.map(({ messageId, agentName }) => ({
      id: messageId,
      name: agentName,
    }));
  }
  return [];
}

/**
 * Resolve the recipient: the only one, or the one the user chose while it is still listed.
 * @param {readonly ComposerRecipient[]} recipients - Available recipients.
 * @param {string} chosenId - Recipient the user last chose.
 * @returns {ComposerRecipient | undefined} The recipient, if determined.
 */
export function pickRecipient(
  recipients: readonly ComposerRecipient[],
  chosenId: string,
): ComposerRecipient | undefined {
  return recipients.length === 1
    ? recipients[0]
    : recipients.find((entry) => entry.id === chosenId);
}

/**
 * Decide whether a message can be sent now.
 * @param {ComposerGate} gate - Run, connection, and recipient state.
 * @returns {boolean} Whether sending is allowed.
 */
export function canSubmitMessage({
  mode,
  initialized,
  connected,
  busy,
  strategyAvailable,
  recipient,
}: ComposerGate): boolean {
  if (!initialized || !connected || busy) {
    return false;
  }
  return mode === "continue" ? strategyAvailable : recipient !== undefined;
}
