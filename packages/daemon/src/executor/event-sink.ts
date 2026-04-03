// EventSink — abstraction for sending daemon messages to clients.
//
// Decouples the strategy executor from WebSocket transport.
// The server (8h) implements this interface; tests use a mock.

import type { DaemonMessage } from "../server/protocol/messages";

// EventSink interface

/**
 * Abstraction for delivering daemon messages to connected clients.
 *
 * The executor uses this to broadcast run events (step_started,
 * agent_streaming, flow_completed, etc.) without knowing how the
 * messages are actually serialized or delivered.
 */
export interface EventSink {
  /**
   * Send a message to all clients subscribed to a run.
   *
   * The server resolves `runId` → subscriber list via `DaemonState`
   * and sends to each.
   */
  broadcast(runId: string, message: DaemonMessage): void;

  /**
   * Send a message to a specific client.
   *
   * Used for targeted messages like `request_input` which go
   * only to the client that initiated the run.
   */
  send(clientId: string, message: DaemonMessage): void;
}
