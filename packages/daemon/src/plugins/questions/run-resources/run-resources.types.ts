/** @internal Run identity, cancellation wiring, and lifetime of its question requester. */
export interface QuestionRunResources {
  /** Identifier of the execution asking questions. */
  readonly runId: string;
  /** Immediate parent execution, when applicable. */
  readonly parentRunId?: string;
  /** Cancellation signal shared by this execution's question requests. */
  readonly signal: AbortSignal;
  /** Handler releasing resources when execution is cancelled. */
  readonly onAbort: () => void;
  /** Remove the execution's cancellation handler. */
  readonly detachAbort: () => void;
  /** Whether execution cleanup has released these resources. */
  disposed: boolean;
}
