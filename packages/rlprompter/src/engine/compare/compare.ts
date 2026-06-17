// compareIterations — pure diff between two iteration timelines.
//
// Text: a unified diff of the two iterations' final agent output.
// Files: the union of paths each iteration ended up mutating, classified as
// added / removed / changed / unchanged by comparing projected file state.

import {
  projectFileState,
  type TimelineEvent,
  unifiedDiff,
} from "@comma-agents/core";
import type {
  CompareInput,
  FileChange,
  IterationComparison,
} from "./compare.types";

/** Compare two iterations. The first argument is the "before" side. */
export function compareIterations(
  a: CompareInput,
  b: CompareInput,
): IterationComparison {
  const textDiff = unifiedDiff(finalText(a.events), finalText(b.events), {
    path: `${a.label} → ${b.label}`,
  });

  const stateA = projectFileState(a.events);
  const stateB = projectFileState(b.events);
  const paths = new Set<string>([...stateA.keys(), ...stateB.keys()]);

  const files: FileChange[] = [];
  for (const path of paths) {
    const inA = present(stateA.get(path)?.deleted, stateA.has(path));
    const inB = present(stateB.get(path)?.deleted, stateB.has(path));
    const shaA = stateA.get(path)?.sha256;
    const shaB = stateB.get(path)?.sha256;

    let status: FileChange["status"];
    let diff = "";
    if (inA && !inB) {
      status = "removed";
      diff = latestDiff(a.events, path);
    } else if (!inA && inB) {
      status = "added";
      diff = latestDiff(b.events, path);
    } else if (inA && inB && shaA !== shaB) {
      status = "changed";
      diff = latestDiff(b.events, path);
    } else {
      // Present-and-equal, or deleted on both sides — skip noise.
      continue;
    }

    files.push({ path, status, diff });
  }

  files.sort((x, y) => x.path.localeCompare(y.path));
  return { textDiff, files };
}

/** A path is "present" when it has an entry that is not marked deleted. */
function present(deleted: boolean | undefined, has: boolean): boolean {
  return has && deleted !== true;
}

/** Final agent output text = the text of the last `agent_call` record. */
function finalText(events: readonly TimelineEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type === "agent_call") return event.record.text;
  }
  return "";
}

/** Most recent successful mutation diff for `path` within `events`. */
function latestDiff(events: readonly TimelineEvent[], path: string): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type !== "tool_mutation" || !event.success) continue;
    if (event.path === path || event.toPath === path) {
      return event.diff ?? "";
    }
  }
  return "";
}
