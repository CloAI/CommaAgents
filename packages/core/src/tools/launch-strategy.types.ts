// Launch-strategy contract — shared between the `launch_strategy` tool
// and the daemon executor that supplies the runtime implementation.
//
// The handle is optional. When `ToolContext.launchStrategy` is set, the
// `launch_strategy` tool delegates to it so that nested strategy runs
// reuse the daemon's flow/agent hooks, broadcasting nested agent
// activity to the TUI as part of the parent run's timeline.
//
// When the handle is absent (e.g., when running tools in tests without
// a daemon), the tool falls back to an in-process `loadStrategy` +
// `flow.call(input)` invocation.

/** Input to a {@link LaunchStrategyHandle}. */
export interface LaunchStrategyRequest {
  /** Absolute path to the strategy file. */
  readonly strategyPath: string;
  /**
   * Optional absolute path to a `comma-project.json` manifest. When
   * present, the runtime is expected to call `loadProject(manifestPath)`
   * before loading the strategy (registering custom tools, etc.).
   */
  readonly manifestPath?: string;
  /** Initial message passed to the strategy's entry flow. */
  readonly input: string;
  /**
   * Provider/model override applied to all LLM agents in the
   * sub-strategy. Format: `"providerID/modelID"`.
   */
  readonly modelOverride?: string;
}

/** Output of a successful sub-strategy run. */
export interface LaunchStrategyResult {
  /** The sub-strategy's `name` field. */
  readonly strategyName: string;
  /** Final text produced by the strategy's entry flow. */
  readonly text: string;
  /**
   * Why the flow stopped (e.g., `"stop"`, `"tool-calls"`). Mirrors
   * `AgentCallResult.finishReason` from the underlying flow call.
   */
  readonly finishReason?: string;
}

/**
 * Run a sub-strategy and return its final result.
 *
 * Implementations are responsible for wiring `inputCollector`,
 * `flowHooks`, agent hooks, and the loaded project (if any), as well
 * as broadcasting events to any observers.
 */
export type LaunchStrategyHandle = (
  request: LaunchStrategyRequest,
) => Promise<LaunchStrategyResult>;
