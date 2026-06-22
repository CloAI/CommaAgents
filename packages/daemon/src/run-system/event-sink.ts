import type { DaemonMessage } from "../server/protocol/messages";

/** Delivers daemon messages to individual clients or run subscribers. */
export interface EventSink {
  /** Send a message to every client subscribed to a run. */
  broadcast(runId: string, message: DaemonMessage): void;

  /** Send a message to one client. */
  send(clientId: string, message: DaemonMessage): void;
}
