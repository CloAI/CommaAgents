import { getLogger } from "@logtape/logtape";
import type { RunError, RunOperationError } from "./errors.types";
import { RunErrorCode } from "./errors.types";
import { RUN_ERROR_MESSAGES } from "./errors.constants";
const logger = getLogger(["comma", "daemon", "plugins", "runs"]);
/**
 *  Construct a throwable domain failure with a reproducible boundary description.
 * @param {RunError} error - Typed domain failure.
 * @returns {Error & RunError} Throwable failure with reproducible description.
 * @internal
 */
export function runError(error: RunError): Error & RunError {
  return Object.assign(new Error(RUN_ERROR_MESSAGES[error.code]), error);
}
/**
 *  Log an unexpected cause once and retain only its code and structured identity.
 * @param {RunOperationError["code"]} code - Stable failure category.
 * @param {string} runId - Stable conversation identity.
 * @param {unknown} cause - Original unexpected failure.
 * @returns {RunOperationError} Persistable code and identity.
 * @internal
 */
export function operationError(
  code: RunOperationError["code"],
  runId: string,
  cause: unknown,
): RunOperationError {
  if (
    cause instanceof Error &&
    "code" in cause &&
    (cause.code === RunErrorCode.PERSISTENCE_ERROR ||
      cause.code === RunErrorCode.PREPARATION_ERROR ||
      cause.code === RunErrorCode.EXECUTION_ERROR)
  ) {
    return { code: cause.code, metadata: { runId } };
  }
  logger.error(`Run ${runId}: ${code}`, { cause });
  return { code, metadata: { runId } };
}
