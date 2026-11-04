import type {
  RunAgentMessage,
  RunChild,
  RunEventMap,
  RunFeedState,
  RunMessage,
  RunStrategyMessage,
  RunUserMessage,
} from "./useRunChannel.types";

/**
 * Replace the item with the same key in place, or append it.
 * Streaming updates the newest item, so the tail is checked before searching.
 * @param {readonly Item[]} items - Current items.
 * @param {Item} next - Item to store.
 * @param {(item: Item) => string} key - Identity of an item.
 * @returns {readonly Item[]} Updated items in order of first appearance.
 */
export function upsertBy<Item>(
  items: readonly Item[],
  next: Item,
  key: (item: Item) => string,
): readonly Item[] {
  const id = key(next);
  const last = items.at(-1);
  const index =
    last !== undefined && key(last) === id
      ? items.length - 1
      : items.findIndex((item) => key(item) === id);
  if (index === -1) {
    return [...items, next];
  }
  const updated = [...items];
  updated[index] = next;
  return updated;
}

/**
 * Drop any earlier item with the same key and append the new one.
 * @param {readonly Item[]} items - Current items.
 * @param {Item} next - Item to store last.
 * @param {(item: Item) => string} key - Identity of an item.
 * @returns {readonly Item[]} Updated items.
 */
export function appendLatest<Item>(
  items: readonly Item[],
  next: Item,
  key: (item: Item) => string,
): readonly Item[] {
  return [...items.filter((item) => key(item) !== key(next)), next];
}

/**
 * Store a message, replacing an earlier form of it.
 * @param {RunFeedState} state - Feed so far.
 * @param {RunMessage} message - Message to store.
 * @returns {RunFeedState} Updated feed.
 */
export function withMessage(
  state: RunFeedState,
  message: RunMessage,
): RunFeedState {
  return {
    ...state,
    messages: upsertBy(state.messages, message, (entry) => entry.id),
  };
}

/**
 * Store a child run, replacing its earlier state.
 * @param {RunFeedState} state - Feed so far.
 * @param {RunChild} child - Child run to store.
 * @returns {RunFeedState} Updated feed.
 */
export function withChild(state: RunFeedState, child: RunChild): RunFeedState {
  return {
    ...state,
    children: upsertBy(state.children, child, (entry) => entry.childRunId),
  };
}

/**
 * Show a message the user sent.
 * @param {RunEventMap["user.input"]} input - Recorded user input.
 * @returns {RunUserMessage} The message to display.
 */
export function userMessage({
  messageId,
  createdAt,
  content,
}: RunEventMap["user.input"]): RunUserMessage {
  return { id: messageId, role: "user", createdAt, content, streaming: false };
}

/**
 * Show a finished agent invocation, keeping the metadata the daemon recorded.
 * @param {RunEventMap["agent.output"]} output - Completed, stopped, or failed agent message.
 * @returns {RunAgentMessage} The message to display.
 */
export function finishedAgentMessage(
  output: RunEventMap["agent.output"],
): RunAgentMessage {
  const completed = output.status === "completed";
  return {
    id: output.messageId,
    role: "agent",
    agentName: output.agentName,
    cancellationReason: output.cancellationReason,
    createdAt: output.createdAt,
    content: output.content,
    streaming: false,
    model: output.model,
    contextWindow: output.contextWindow,
    completedAt: output.completedAt,
    interruption:
      output.status === "stopped" || output.status === "failed"
        ? output.status
        : undefined,
    usage: completed ? output.usage : undefined,
    contextUsage: completed ? output.contextUsage : undefined,
  };
}

/**
 * Fold a streamed block into the message so far; each block carries its full content to date.
 * @param {RunMessage | undefined} previous - Message with the same ID, if any.
 * @param {RunEventMap["agent.stream"]} chunk - Latest content of one block.
 * @returns {RunAgentMessage} The still-streaming message.
 */
export function streamedAgentMessage(
  previous: RunMessage | undefined,
  chunk: RunEventMap["agent.stream"],
): RunAgentMessage {
  const content = [...(previous?.content ?? [])];
  for (let index = content.length; index < chunk.contentIndex; index++) {
    content[index] = { type: "text", text: "" };
  }
  content[chunk.contentIndex] = chunk.content;
  return {
    id: chunk.messageId,
    role: "agent",
    agentName: chunk.agentName,
    createdAt: chunk.createdAt,
    model: chunk.model,
    contextWindow: chunk.contextWindow,
    content,
    streaming: true,
  };
}

/**
 * Show a durable strategy transition in the conversation timeline.
 * @param {object} change - Saved selection transition.
 * @returns {RunStrategyMessage} Timeline message attributed to the strategy change.
 */
export function strategyMessage(change: {
  readonly messageId: string;
  readonly createdAt: string;
  readonly previousName: string;
  readonly nextName: string;
}): RunStrategyMessage {
  return {
    id: change.messageId,
    createdAt: change.createdAt,
    role: "strategy",
    streaming: false,
    content: [
      {
        type: "text",
        text: `Strategy changed: ${change.previousName} → ${change.nextName}`,
      },
    ],
  };
}
