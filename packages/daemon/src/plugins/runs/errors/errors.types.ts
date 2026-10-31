/** Stable run failures; descriptions are generated rather than persisted. */
export enum RunErrorCode {
  RUN_NOT_FOUND = "RUN_NOT_FOUND",
  RUN_BUSY = "RUN_BUSY",
  INVALID_RUN_STATE = "INVALID_RUN_STATE",
  INPUT_NOT_FOUND = "INPUT_NOT_FOUND",
  INVALID_ARGUMENTS = "INVALID_ARGUMENTS",
  INVALID_CURSOR = "INVALID_CURSOR",
  PREPARATION_ERROR = "PREPARATION_ERROR",
  EXECUTION_ERROR = "EXECUTION_ERROR",
  TOOL_EXECUTION_ERROR = "TOOL_EXECUTION_ERROR",
  PERSISTENCE_ERROR = "PERSISTENCE_ERROR",
}
/** Context needed to identify an expected request failure. */
export interface RunRequestError {
  readonly code:
    | RunErrorCode.RUN_NOT_FOUND
    | RunErrorCode.RUN_BUSY
    | RunErrorCode.INVALID_RUN_STATE;
  readonly metadata: { readonly runId: string };
}
/** Context for an input that is absent or already answered. */
export interface RunInputError {
  readonly code: RunErrorCode.INPUT_NOT_FOUND;
  readonly metadata: { readonly runId: string; readonly inputId: string };
}
/** A storage or runtime failure whose diagnostic is logged separately. */
export interface RunOperationError {
  readonly code:
    | RunErrorCode.PREPARATION_ERROR
    | RunErrorCode.EXECUTION_ERROR
    | RunErrorCode.PERSISTENCE_ERROR;
  readonly metadata: { readonly runId: string };
}
/** Invalid pagination or request arguments. */
export interface RunArgumentError {
  readonly code: RunErrorCode.INVALID_ARGUMENTS | RunErrorCode.INVALID_CURSOR;
}
/** Persistable failure data without repeated human-readable descriptions. */
export type RunError =
  | RunRequestError
  | RunInputError
  | RunOperationError
  | RunArgumentError;
