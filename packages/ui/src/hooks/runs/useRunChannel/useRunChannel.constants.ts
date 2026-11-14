import type { RunFeedState } from "./useRunChannel.types";

/** State before the first channel message arrives. */
export const INITIAL_RUN_FEED: RunFeedState = {
  messages: [],
  pendingInputs: [],
  activeAgents: [],
  children: [],
  initialized: false,
};

/** Nobody is waiting for input or can be steered once a run stops executing. */
export const NO_ACTIVITY = { pendingInputs: [], activeAgents: [] } as const;
