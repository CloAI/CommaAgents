import type { Instance } from "ink";

export interface RunTuiOptions {
  /** Strategy name to open immediately. */
  readonly strategy?: string;
  /** Initial input message passed to the selected strategy. */
  readonly input?: string;
  /** Daemon WebSocket URL. @default ws://localhost:7422/ws */
  readonly daemonUrl?: string;
  /** Enable the component playground. @default false */
  readonly dev?: boolean;
}

export type TuiInstance = Instance;
