import type { DaemonAction, DaemonStore, RunStatus } from "../daemon-store";
import type { Logger } from "../logger/logger.types";

/** Runtime facts published while coordinating a run. @internal */
export type RunRuntimeEvent =
  | { readonly type: "run.runtime.prepared"; readonly runId: string }
  | { readonly type: "run.runtime.started"; readonly runId: string }
  | {
      readonly type: "run.runtime.finished";
      readonly runId: string;
      readonly status: RunStatus;
    };

/** Runtime facts published when MCP selection changes. @internal */
export interface McpRuntimeEvent {
  /** Runtime event discriminant. */
  readonly type: "mcp.runtime.updated";
  /** Run receiving the override, omitted for shared defaults. */
  readonly runId?: string;
  /** MCP server whose effective selection changed. */
  readonly serverId: string;
  /** Whether the server is now enabled. */
  readonly enabled: boolean;
}

/** Runtime facts published for daemon client connections. @internal */
export type ClientRuntimeEvent =
  | { readonly type: "client.runtime.connected"; readonly clientId: string }
  | { readonly type: "client.runtime.disconnected"; readonly clientId: string };

/** Internal fact observable by daemon effects. @internal */
export type DaemonEvent =
  | DaemonAction
  | RunRuntimeEvent
  | McpRuntimeEvent
  | ClientRuntimeEvent;

/** Synchronous observer of selected daemon events. @internal */
export interface DaemonEffect {
  /** Diagnostic effect identifier used for failure reporting. */
  readonly name: string;
  /** Optional event filter; omission observes every event. */
  readonly eventTypes?: readonly DaemonEvent["type"][];
  /** Synchronously observe an already-published daemon fact. */
  handle(event: DaemonEvent): void;
}

/** Typed synchronous daemon event publication. @internal */
export interface DaemonEventDispatcher {
  /** Publish an event synchronously in effect registration order. */
  publish(event: DaemonEvent): void;
  /** Register an effect and return its unsubscribe callback. */
  subscribe(effect: DaemonEffect): () => void;
  /** Disconnect store observation and remove every registered effect. */
  dispose(): void;
}

/** Dependencies used to create daemon event dispatching. @internal */
export interface DaemonEventDispatcherConfig {
  /** Authoritative store whose successful actions become daemon events. */
  readonly daemonStore: DaemonStore;
  /** Effects installed when the dispatcher is created. */
  readonly effects?: readonly DaemonEffect[];
  /** Destination for isolated effect failure diagnostics. */
  readonly logger: Logger;
}
