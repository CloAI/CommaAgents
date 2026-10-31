import { createContext, useContext } from "react";
import type { RunFeed } from "../useRunChannel";
import type { RunControls } from "./RunProvider.types";

/** The followed run's feed; changes with every streamed block. */
export const RunFeedContext = createContext<RunFeed | null>(null);

/** The followed run's controls; split from the feed so they do not re-render on every block. */
export const RunControlsContext = createContext<RunControls | null>(null);

/**
 * Read the enclosing run's controls.
 * @returns {RunControls} Submission, strategy, and stop slices.
 */
export function useRunControls(): RunControls {
  const controls = useContext(RunControlsContext);
  if (!controls)
    throw new Error("Run hooks must be used within a RunProvider.");
  return controls;
}

/**
 * Read the feed of the run followed by the enclosing {@link RunProvider}.
 * @returns {RunFeed} Messages, status, and current input recipients.
 */
export function useRunFeed(): RunFeed {
  const feed = useContext(RunFeedContext);
  if (!feed) throw new Error("useRunFeed must be used within a RunProvider.");
  return feed;
}
