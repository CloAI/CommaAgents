import type { TimelineEvent } from "@comma-agents/core";
import type { RunSnapshot } from "../runs.types";
import { snapshotFromEvents } from "./history.utils";
import { validateRunTimeline } from "./history.validation";
import type { RunsContext } from "../state/state.types";
import { getRunLineage, hydrateRunLineage } from "../identity";

/** @internal A required timeline write failed. */
export class PersistenceFailure extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PersistenceFailure";
  }
}

/**
 * Persist a required event before acknowledging the operation.
 * @param {RunsContext} context - Private runs state and repository.
 * @param {string} runId - Run whose timeline receives the event.
 * @param {TimelineEvent} event - Required event.
 * @returns {Promise<void>} Resolves after the durable append.
 * @internal
 */
export async function appendRunEvent(
  context: RunsContext,
  runId: string,
  event: TimelineEvent,
): Promise<void> {
  try {
    const lineage = getRunLineage(context, runId);
    const identity = lineage[0]!;
    await context.repository.appendEvent(lineage.at(-1)!.runId, {
      ...event,
      runId,
      ...(identity.parentRunId ? { parentRunId: identity.parentRunId } : {}),
    });
  } catch (error) {
    throw new PersistenceFailure(error);
  }
}

/**
 * Read the complete persisted timeline without projecting consumer-specific history.
 * @param {RunsContext} context - Private runs state and repository.
 * @param {string} runId - Execution whose root-owned timeline is read.
 * @returns {Promise<readonly TimelineEvent[]>} All persisted events in order.
 * @internal
 */
export async function getRunHistory(
  context: RunsContext,
  runId: string,
): Promise<readonly TimelineEvent[]> {
  const lineage = await hydrateRunLineage(context, runId);
  if (!lineage) return [];
  const events = await context.repository.getEvents(lineage.at(-1)!.runId, {
    strict: true,
  });
  validateRunTimeline(events);
  return events;
}

/**
 * Read a live snapshot or hydrate a terminal snapshot from persisted lifecycle events.
 * @param {RunsContext} context - Private runs state and repository.
 * @param {string} runId - Run to read.
 * @returns {Promise<RunSnapshot | undefined>} Current or persisted snapshot.
 * @internal
 */
export async function getRunSnapshot(
  context: RunsContext,
  runId: string,
): Promise<RunSnapshot | undefined> {
  const current = context.runs.get(runId);
  if (current) return current.snapshot;
  const snapshot = snapshotFromEvents(
    runId,
    await getRunHistory(context, runId),
  );
  if (!snapshot) return undefined;
  if (!context.runs.has(runId)) {
    context.runs.set(runId, {
      snapshot,
      lifecycle: { phase: "terminal" },
      controller: new AbortController(),
      optionsKey: "",
      disposers: [],
      pendingInput: new Map(),
      steering: [],
      children: new Set(),
    });
  }
  return context.runs.get(runId)?.snapshot;
}
