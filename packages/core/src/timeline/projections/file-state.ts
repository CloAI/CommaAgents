import type {
  SessionFileEntry,
  SessionFileState,
} from "../../tools/io/session-file-state";
import type { TimelineEvent } from "../timeline.types";

/**
 * Pure projection: Replays timeline events to build a SessionFileState.
 * This is the exact spiritual successor of `buildSessionFileState` from the tools package,
 * retargeted to project from `tool_mutation` events in the timeline.
 */
export function projectFileState(
  events: readonly TimelineEvent[],
): SessionFileState {
  const state = new Map<string, SessionFileEntry>();

  for (const event of events) {
    if (event.type !== "tool_mutation") continue;
    if (!event.success) continue;

    switch (event.operation) {
      case "create":
      case "update": {
        if (event.afterSha256 === undefined) continue;
        state.set(event.path, {
          path: event.path,
          sha256: event.afterSha256,
          deleted: false,
          stale: false,
        });
        break;
      }
      case "delete": {
        state.set(event.path, {
          path: event.path,
          sha256: event.beforeSha256 ?? "",
          deleted: true,
          stale: false,
        });
        break;
      }
      case "move": {
        if (event.toPath === undefined || event.afterSha256 === undefined) {
          continue;
        }
        state.delete(event.path);
        state.set(event.toPath, {
          path: event.toPath,
          sha256: event.afterSha256,
          deleted: false,
          stale: false,
        });
        break;
      }
    }
  }

  return state;
}
