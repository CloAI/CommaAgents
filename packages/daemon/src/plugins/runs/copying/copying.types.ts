/** A stable complete response available for copying without copying running work. */
export interface RunCopyCheckpoint {
  readonly checkpointId: string;
  readonly completedAt: Date;
  readonly runIds: readonly string[];
}

/** Destination of an independent copy of a completed conversation tree. */
export interface CopyRunOptions {
  readonly runId: string;
  readonly targetRunId?: string;
  readonly cwd: string;
  /** Pin the reviewed boundary even if the source finishes another response. */
  readonly checkpointId?: string;
}

/** Newly owned run identities, including the complete delegated tree. */
export interface CopiedRun {
  readonly runId: string;
  readonly runIds: readonly string[];
}
