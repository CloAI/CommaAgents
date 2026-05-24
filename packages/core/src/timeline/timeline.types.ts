import type { UserModelMessage } from "ai";
import type { ResponseMessage } from "../context/conversation-context.types";

/**
 * Union type representing any event recorded on a strategy run's timeline.
 * All events are immutable, timestamped, and conform to this common schema.
 */
export type TimelineEvent =
  | {
      readonly type: "run_started";
      readonly ts: string;
      readonly strategyPath: string;
      readonly strategyName: string;
      readonly cwd: string;
      readonly initialInput?: string;
      readonly manifestPath?: string;
    }
  | {
      readonly type: "run_completed";
      readonly ts: string;
      readonly status: "completed" | "error" | "cancelled";
      readonly error?: { readonly code: string; readonly message: string };
    }
  | {
      readonly type: "agent_call";
      readonly ts: string;
      readonly agentName: string;
      readonly userMessage: UserModelMessage;
      readonly responseMessages: readonly ResponseMessage[];
    }
  | {
      readonly type: "user_input";
      readonly ts: string;
      readonly agentName: string;
      readonly text: string;
      readonly source: "human" | "agent";
    }
  | {
      readonly type: "tool_mutation";
      readonly ts: string;
      readonly agentName: string;
      readonly toolName: string;
      readonly operation: "create" | "update" | "delete" | "move";
      readonly path: string;
      readonly toPath?: string;
      readonly beforeSha256?: string;
      readonly afterSha256?: string;
      readonly diff?: string;
      readonly success: boolean;
      readonly error?: string;
      readonly details?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: "step_started";
      readonly ts: string;
      readonly stepName: string;
      readonly flowName?: string;
      readonly agentName?: string;
      readonly index?: number;
    }
  | {
      readonly type: "step_completed";
      readonly ts: string;
      readonly stepName: string;
      readonly flowName?: string;
      readonly agentName?: string;
      readonly index?: number;
    }
  | {
      readonly type: "permission_decision";
      readonly ts: string;
      readonly decision: "allow" | "deny" | "allow-session" | "deny-session";
      readonly agentName?: string;
      readonly toolName?: string;
      readonly resource?: string;
    };

/** Filter parameters for querying events from a Timeline. */
export interface TimelineFilter {
  /** Keep only events matching this exact type. */
  readonly type?: TimelineEvent["type"];
  /** Keep only events produced by or involving this agent. */
  readonly agentName?: string;
  /** Keep only events occurring after this ISO-8601 UTC timestamp. */
  readonly since?: string;
}

/**
 * Closure-based Timeline stream.
 * Tracks strategy run progress as an append-only sequence of immutable events.
 */
export interface Timeline {
  /** Append an event to the timeline. Throws if the event is malformed. */
  append(event: TimelineEvent): void;
  /** Retrieve a read-only list of events, optionally matching a filter. */
  events(filter?: TimelineFilter): readonly TimelineEvent[];
  /** Total number of events currently in the timeline. */
  readonly size: number;
  /** Clears all events from the timeline. */
  clear(): void;
  /** Iterator support for walking events. */
  [Symbol.iterator](): Iterator<TimelineEvent>;
}
