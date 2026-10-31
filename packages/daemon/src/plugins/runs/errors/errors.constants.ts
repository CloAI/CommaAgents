import { RunErrorCode } from "./errors.types";
export const RUN_ERROR_MESSAGES: Record<RunErrorCode, string> = {
  RUN_NOT_FOUND: "Run not found",
  RUN_BUSY: "Run is busy",
  INVALID_RUN_STATE: "Invalid run state",
  INPUT_NOT_FOUND: "Input request not found",
  INVALID_ARGUMENTS: "Invalid run arguments",
  INVALID_CURSOR: "Invalid history cursor",
  PREPARATION_ERROR: "Run preparation failed",
  EXECUTION_ERROR: "Run execution failed",
  TOOL_EXECUTION_ERROR: "Tool execution failed",
  PERSISTENCE_ERROR: "Run persistence failed",
};
