import { NO_ACTIVITY } from "./useRunChannel.constants";
import type { RunEventMap, RunFeedState } from "./useRunChannel.types";
import {
  appendLatest,
  finishedAgentMessage,
  strategyMessage,
  streamedAgentMessage,
  userMessage,
  withChild,
  withMessage,
} from "./useRunChannel.utils";

type HistoryEntry = RunEventMap["run.initial"]["history"]["entries"][number];

/** How each channel event changes the feed; every event type must be listed. */
type RunEventHandlers = {
  readonly [Type in keyof RunEventMap]: (
    state: RunFeedState,
    data: RunEventMap[Type],
  ) => RunFeedState;
};

/**
 * Fold one finished history entry into the feed.
 * @param {RunFeedState} state - Feed so far.
 * @param {HistoryEntry} entry - Saved message, strategy change, or child run.
 * @returns {RunFeedState} Updated feed.
 */
function applyHistoryEntry(
  state: RunFeedState,
  entry: HistoryEntry,
): RunFeedState {
  switch (entry.type) {
    case "strategy.changed":
      return withMessage(state, strategyMessage(entry));
    case "child.run":
      return withChild(state, entry);
    case "message":
      return withMessage(
        state,
        entry.role === "agent"
          ? finishedAgentMessage(entry)
          : userMessage(entry),
      );
  }
}

const HANDLERS: RunEventHandlers = {
  // History holds finished messages; streamed ones arrive afterwards.
  "run.initial": (
    state,
    { snapshot, history, pendingInputs, activeAgents },
  ) => ({
    ...history.entries.reduce(applyHistoryEntry, state),
    snapshot,
    pendingInputs,
    activeAgents: activeAgents ?? [],
    initialized: true,
  }),
  "run.state": (state, snapshot) => {
    const revision = state.snapshot?.strategyState?.revision ?? 0;
    const changed = (snapshot.strategyState?.changes ?? [])
      .filter((change) => change.revision > revision)
      .reduce(
        (next, change) => withMessage(next, strategyMessage(change)),
        state,
      );
    return {
      ...changed,
      ...(snapshot.phase === "running" ? {} : NO_ACTIVITY),
      snapshot,
      // A continued conversation starts over; only a terminal run keeps its failure.
      failure: snapshot.phase === "terminal" ? state.failure : undefined,
    };
  },
  "input.requested": (state, input) => ({
    ...state,
    pendingInputs: appendLatest(
      state.pendingInputs,
      input,
      (entry) => entry.inputId,
    ),
  }),
  "input.resolved": (state, { inputId }) => ({
    ...state,
    pendingInputs: state.pendingInputs.filter(
      (entry) => entry.inputId !== inputId,
    ),
  }),
  "agent.started": (state, agent) => ({
    ...state,
    activeAgents: appendLatest(
      state.activeAgents,
      agent,
      (entry) => entry.messageId,
    ),
  }),
  "user.input": (state, input) => withMessage(state, userMessage(input)),
  "agent.stream": (state, chunk) =>
    withMessage(
      state,
      streamedAgentMessage(
        state.messages.findLast((message) => message.id === chunk.messageId),
        chunk,
      ),
    ),
  "agent.output": (state, output) =>
    withMessage(
      {
        ...state,
        activeAgents: state.activeAgents.filter(
          (entry) => entry.messageId !== output.messageId,
        ),
      },
      finishedAgentMessage(output),
    ),
  "child.run": withChild,
  "run.step": (state) => state,
  "run.steer.queued": (state) => state,
  "run.error": (state, { error }) => ({
    ...state,
    ...NO_ACTIVITY,
    failure: `Run failed (${error.code}).`,
  }),
};

/**
 * Fold one channel event into the feed.
 * @param {RunFeedState} state - Feed so far.
 * @param {{ type: Type, data: RunEventMap[Type] }} message - Next event from the run's channel.
 * @returns {RunFeedState} Updated feed.
 */
export function reduceRunFeed<Type extends keyof RunEventMap>(
  state: RunFeedState,
  message: { readonly type: Type; readonly data: RunEventMap[Type] },
): RunFeedState {
  return HANDLERS[message.type](state, message.data);
}
