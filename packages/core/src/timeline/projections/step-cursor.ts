import type { TimelineEvent } from "../timeline.types";

export interface StepCursor {
  /** Map of flowName_stepName_index → true, indicating steps that fully completed in a previous run. */
  readonly completedSteps: ReadonlyMap<string, boolean>;
  /** Index of the most recent completed step, or -1 if none. */
  readonly lastCompletedIndex: number;
}

/**
 * Pure projection: Replays step events on the timeline to identify which steps
 * completed successfully and can be fast-forwarded (skipped) during resume.
 *
 * Compares step start/complete pairs. Completed steps are mapped so the resume
 * executor knows which ones can be replayed from the cache.
 */
export function projectStepCursor(
  events: readonly TimelineEvent[],
): StepCursor {
  const completedSteps = new Map<string, boolean>();
  let lastCompletedIndex = -1;

  for (const event of events) {
    if (event.type === "step_completed") {
      const key = `${event.flowName}:${event.stepName}:${event.index}`;
      completedSteps.set(key, true);
      lastCompletedIndex = Math.max(lastCompletedIndex, event.index);
    }
  }

  return {
    completedSteps,
    lastCompletedIndex,
  };
}
