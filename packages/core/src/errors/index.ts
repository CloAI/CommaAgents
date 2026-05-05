// Domain-specific error classes for CommaAgents

/**
 * Base error for all CommaAgents errors.
 * Provides a consistent `code` field for programmatic handling.
 */
export class CommaAgentsError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CommaAgentsError";
    this.code = code;
  }
}

/**
 * Thrown when a model string cannot be resolved to an AI SDK LanguageModel.
 * Examples: unknown provider, missing API key, package not installed.
 */
export class ModelResolutionError extends CommaAgentsError {
  readonly modelString: string;

  constructor(modelString: string, message: string, options?: ErrorOptions) {
    super("MODEL_RESOLUTION_ERROR", message, options);
    this.name = "ModelResolutionError";
    this.modelString = modelString;
  }
}

/**
 * Thrown when an agent encounters an error during its call lifecycle.
 */
export class AgentCallError extends CommaAgentsError {
  readonly agentName: string;

  constructor(agentName: string, message: string, options?: ErrorOptions) {
    super("AGENT_CALL_ERROR", message, options);
    this.name = "AgentCallError";
    this.agentName = agentName;
  }
}

/**
 * Thrown when a flow encounters an error during execution.
 */
export class FlowExecutionError extends CommaAgentsError {
  readonly flowName: string;

  constructor(flowName: string, message: string, options?: ErrorOptions) {
    super("FLOW_EXECUTION_ERROR", message, options);
    this.name = "FlowExecutionError";
    this.flowName = flowName;
  }
}

/**
 * Thrown when a tool execution fails.
 */
export class ToolExecutionError extends CommaAgentsError {
  readonly toolName: string;

  constructor(toolName: string, message: string, options?: ErrorOptions) {
    super("TOOL_EXECUTION_ERROR", message, options);
    this.name = "ToolExecutionError";
    this.toolName = toolName;
  }
}

/**
 * Thrown when a strategy file fails validation.
 */
export class StrategyValidationError extends CommaAgentsError {
  constructor(message: string, options?: ErrorOptions) {
    super("STRATEGY_VALIDATION_ERROR", message, options);
    this.name = "StrategyValidationError";
  }
}

/**
 * Thrown when a sandbox policy rejects a file-system operation.
 *
 * The `reason` field indicates why the operation was blocked:
 * - `"jail"` — the resolved path escapes the sandbox cwd boundary.
 * - `"read-denied"` — the read policy explicitly denies this path.
 * - `"write-denied"` — the write policy explicitly denies this path.
 * - `"ask-no-handler"` — policy is `"ask"` but no PermissionRequester is configured.
 * - `"ask-aborted"` — the PermissionRequester threw or the AbortSignal fired.
 */
export class SandboxViolationError extends CommaAgentsError {
  readonly path: string;
  readonly reason: "jail" | "read-denied" | "write-denied" | "ask-no-handler" | "ask-aborted";

  constructor(
    path: string,
    reason: "jail" | "read-denied" | "write-denied" | "ask-no-handler" | "ask-aborted",
    message: string,
    options?: ErrorOptions,
  ) {
    super("SANDBOX_VIOLATION", message, options);
    this.name = "SandboxViolationError";
    this.path = path;
    this.reason = reason;
  }
}

/**
 * Thrown when a hook function throws during execution.
 */
export class HookExecutionError extends CommaAgentsError {
  readonly hookName: string;

  constructor(hookName: string, message: string, options?: ErrorOptions) {
    super("HOOK_EXECUTION_ERROR", message, options);
    this.name = "HookExecutionError";
    this.hookName = hookName;
  }
}
