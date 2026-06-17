import type { Timeline, TimelineEvent, TimelineFilter } from "./timeline.types";

/**
 * Filter an array of timeline events based on common filter parameters.
 * Implemented as a pure helper in accordance with ts-patterns.
 */
export function filterEvents(
  events: readonly TimelineEvent[],
  filter?: TimelineFilter,
): readonly TimelineEvent[] {
  if (!filter) return events;
  const { type, agentName, since } = filter;

  return events.filter((event) => {
    if (type !== undefined && event.type !== type) return false;
    if (agentName !== undefined && !eventHasAgent(event, agentName))
      return false;
    if (since !== undefined && event.ts <= since) return false;
    return true;
  });
}

/** Pure helper to determine if an event involves a given agent. */
function eventHasAgent(event: TimelineEvent, agentName: string): boolean {
  switch (event.type) {
    case "agent_call":
      return event.record.agentName === agentName;
    case "user_input":
    case "tool_mutation":
    case "step_started":
    case "step_completed":
    case "permission_decision":
      return event.agentName === agentName;
    default:
      return false;
  }
}

/**
 * Construct a fresh in-memory Timeline stream.
 * Uses a closure to capture state privately.
 */
export function createTimeline(
  initialEvents?: readonly TimelineEvent[],
): Timeline {
  let list: TimelineEvent[] = initialEvents ? [...initialEvents] : [];

  return {
    get size() {
      return list.length;
    },

    append(event: TimelineEvent): void {
      if (!event.ts) {
        throw new Error("TimelineEvent must specify a timestamp ('ts')");
      }
      list.push(event);
    },

    events(filter?: TimelineFilter): readonly TimelineEvent[] {
      return filterEvents(list, filter);
    },

    clear(): void {
      list = [];
    },

    [Symbol.iterator](): Iterator<TimelineEvent> {
      let index = 0;
      const currentList = list;
      return {
        next(): IteratorResult<TimelineEvent> {
          if (index < currentList.length) {
            return {
              value: currentList[index++]!,
              done: false,
            } as IteratorYieldResult<TimelineEvent>;
          }
          return {
            value: undefined,
            done: true,
          } as IteratorReturnResult<undefined>;
        },
      };
    },
  };
}
