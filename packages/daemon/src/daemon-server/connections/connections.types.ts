import type { BindingRegistry } from "../registry";

/** @internal Transport operations for one connected WebSocket. */
export interface CreateConnectionOptions {
  readonly registry: BindingRegistry;
  readonly send: (message: string) => void;
  readonly close: (code: number, reason: string) => void;
}

/** @internal Request routing and connection-owned subscription cleanup. */
export interface Connection {
  receive(message: string): Promise<void>;
  dispose(): Promise<void>;
}
