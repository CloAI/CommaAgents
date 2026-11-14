import type { LspRequest, LspResponse } from "@comma-agents/core/language";
import type { Plugin } from "../../daemon-plugin";
import type { RunsPlugin } from "../runs";

/** Dependencies used to attach language services to executions. */
export interface CreateLspPluginOptions {
  /** Services supplied by the daemon. */
  readonly dependencies: {
    /** Run preparation and strategy-hook registration. */
    readonly runs: RunsPlugin;
  };
}

/** Lifecycle of the language subprocess associated with a working directory. */
export type LspProcessPhase =
  | "stopped"
  | "starting"
  | "running"
  | "restarting"
  | "failed"
  | "stopping";

/** Read-only status of one working directory's language subprocess. */
export interface LspProcessStatus {
  /** Resolved absolute working directory. */
  readonly cwd: string;
  /** Current process lifecycle. */
  readonly phase: LspProcessPhase;
  /** Executions that have acquired a reference through a language request. */
  readonly runIds: readonly string[];
  /** Operating-system process identifier, when started. */
  readonly pid?: number;
  /** Most recent startup or process failure. */
  readonly error?: string;
}

/** Shared per-cwd language services with execution-owned references. */
export interface LspPlugin extends Plugin<"lsp"> {
  /** Query saved workspace files for a prepared or running execution. */
  request(
    runId: string,
    request: LspRequest,
    signal?: AbortSignal,
  ): Promise<LspResponse>;
  /** Inspect a working directory without starting its subprocess. */
  getStatus(cwd: string): LspProcessStatus;
}
