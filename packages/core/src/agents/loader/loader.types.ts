// Agent loader types — configuration contracts for loadAgent.

/**
 * Options for loading an agent from a description file.
 *
 * All fields are optional. Model and tool resolution are handled
 * internally by `createAgent()` using the global provider registry
 * (`registerProvider()`), model registry (`registerModel()`), and
 * tool registry (`registerTool()`).
 *
 * @example
 * ```ts
 * // Zero-config — uses global credential store and provider resolver
 * const agent = await loadAgent("./agents/researcher.yaml");
 * ```
 */
export interface LoadAgentOptions {
  /**
   * Abort signal for cancellation.
   * Passed to the created agent for cooperative cancellation.
   */
  readonly abort?: AbortSignal;
}
