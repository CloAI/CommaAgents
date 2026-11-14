/** Stable run failure categories. */
export enum RunErrorCode {
  RUN_NOT_FOUND = "RUN_NOT_FOUND",
  RUN_BUSY = "RUN_BUSY",
  INVALID_RUN_STATE = "INVALID_RUN_STATE",
  INPUT_NOT_FOUND = "INPUT_NOT_FOUND",
  INVALID_ARGUMENTS = "INVALID_ARGUMENTS",
  INVALID_CURSOR = "INVALID_CURSOR",
  PREPARATION_ERROR = "PREPARATION_ERROR",
  MISSING_MODEL_ROLES = "MISSING_MODEL_ROLES",
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
/** A storage or runtime failure with optional diagnostic text. */
export interface RunOperationError {
  /** Original failure message and nested causes, without stack traces. */
  readonly message?: string;
  readonly code:
    | RunErrorCode.PREPARATION_ERROR
    | RunErrorCode.EXECUTION_ERROR
    | RunErrorCode.PERSISTENCE_ERROR;
  readonly metadata: { readonly runId: string };
}
/** A strategy refers to `@role` models the daemon has not configured. */
export interface RunMissingModelRolesError {
  readonly code: RunErrorCode.MISSING_MODEL_ROLES;
  readonly metadata: {
    readonly runId: string;
    /** Role names without the `@` prefix. */
    readonly roles: readonly string[];
  };
}
/** Invalid pagination or request arguments. */
export interface RunArgumentError {
  readonly code: RunErrorCode.INVALID_ARGUMENTS | RunErrorCode.INVALID_CURSOR;
}
/** Persistable failure data with diagnostic text when available. */
export type RunError =
  | RunRequestError
  | RunInputError
  | RunOperationError
  | RunMissingModelRolesError
  | RunArgumentError;
