import { waitFor } from "storybook/test";
import { act } from "react";
import { MockWebSocket } from "../useWebSocket/test.utils";

/** Outbound messages captured from the shared browser socket. */
export interface CapturedRequest {
  readonly type: "command" | "subscribe" | "unsubscribe";
  readonly requestId: string;
  readonly command?: string;
  readonly channel?: string;
  readonly arguments?: Record<string, unknown>;
}

/** Read captured messages, optionally filtering their operation kind.
 * @param {MockWebSocket} socket - Browser socket fixture.
 * @param {CapturedRequest["type"]} [kind] - Optional operation kind.
 * @returns {CapturedRequest[]} Matching outgoing requests.
 */
export function requests(
  socket: MockWebSocket,
  kind?: CapturedRequest["type"],
): CapturedRequest[] {
  return socket.sent
    .map((message) => JSON.parse(message) as CapturedRequest)
    .filter((request) => !kind || request.type === kind);
}

/** Deliver a valid daemon envelope with the correlation metadata.
 * @param {MockWebSocket} socket - Browser socket fixture.
 * @param {string} requestId - Correlated outgoing operation ID.
 * @param {Record<string, unknown>} message - Response or domain-event contents.
 * @returns {void} No return value.
 */
export function deliver(
  socket: MockWebSocket,
  requestId: string,
  message: Record<string, unknown>,
): void {
  socket.message(
    JSON.stringify({ requestId, ts: "2026-10-23T12:00:00.000Z", ...message }),
  );
}

/** Create a concrete history response.
 * @param {string} cursor - Cursor marker used to distinguish request results.
 * @returns {{entries: never[], page: {hasMore: boolean, before: string}}} A valid history result.
 */
export function historyData(cursor: string) {
  return { entries: [], page: { hasMore: true, before: cursor } };
}

/** Wait for the latest command with a name and answer it.
 * @param {MockWebSocket} socket - Browser socket fixture.
 * @param {string} command - Command to answer.
 * @param {Record<string, unknown>} message - Response contents.
 * @returns {Promise<CapturedRequest>} The request that was answered.
 */
export async function answerCommand(
  socket: MockWebSocket,
  command: string,
  message: Record<string, unknown>,
): Promise<CapturedRequest> {
  const request = await waitFor(() => {
    const found = requests(socket, "command")
      .filter((candidate) => candidate.command === command)
      .at(-1);
    if (!found) throw new Error(`No ${command} request yet.`);
    return found;
  });
  await act(() => deliver(socket, request.requestId, message));
  return request;
}

/** Wait for the latest subscription to a channel and acknowledge it.
 * @param {MockWebSocket} socket - Browser socket fixture.
 * @param {string} channel - Channel to acknowledge.
 * @returns {Promise<CapturedRequest>} The acknowledged subscription.
 */
export async function acknowledgeSubscription(
  socket: MockWebSocket,
  channel: string,
): Promise<CapturedRequest> {
  const subscription = await waitFor(() => {
    const found = requests(socket, "subscribe")
      .filter((candidate) => candidate.channel === channel)
      .at(-1);
    if (!found) throw new Error(`Not subscribed to ${channel} yet.`);
    return found;
  });
  await act(() =>
    deliver(socket, subscription.requestId, {
      type: "response",
      ok: true,
      data: null,
    }),
  );
  return subscription;
}

/** Describe a run in the given phase.
 * @param {string} runId - Run identity.
 * @param {string} phase - Lifecycle phase.
 * @param {Record<string, unknown>} [extra] - Further snapshot fields, such as an outcome.
 * @returns {Record<string, unknown>} A snapshot message payload.
 */
export function runSnapshot(
  runId: string,
  phase: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    phase,
    runId,
    configuration: { strategyPath: "/work/strategy.json", cwd: "/work" },
    strategy: { name: "Talk", agents: ["assistant"], flow: {} },
    ...extra,
  };
}

/** Describe the text an agent has produced so far.
 * @param {string} runId - Run identity.
 * @param {string} text - Text so far.
 * @returns {Record<string, unknown>} An agent.stream message.
 */
export function streamedText(
  runId: string,
  text: string,
): Record<string, unknown> {
  return {
    type: "agent.stream",
    data: {
      runId,
      messageId: "m1",
      agentName: "assistant",
      createdAt: "2026-10-25T12:00:00.000Z",
      contentIndex: 0,
      content: { type: "text", text },
    },
  };
}
