// Strategy loader types — configuration and result contracts.

import type { Agent } from "../../agents/agent/agent.types";
import type { InputCollector } from "../../agents/built-in/user/user-agent.types";
import type { ConversationTurn } from "../../context/conversation-context.types";
import type { FlowHooks } from "../../flows/flow/flow.types";
import type { LanguageService } from "../../language";
import type { SkillRegistry } from "../../skills/skills.types";
import type { LaunchStrategyHandle } from "../../tools/launch-strategy.types";
import type { Strategy } from "../schema";

/**
 * Options for loading a strategy.
 *
 * Model and tool resolution happen internally via global registries
 * (registerModel / registerProvider / registerTool). The loader does
 * not accept provider factories or credential stores — callers must
 * configure those globally before loading a strategy.
 */
export interface LoadStrategyOptions {
  /**
   * Optional map of agent name → prior conversation turns to hydrate for replay.
   * When provided, each instantiated agent is hydrated with these turns
   * and enters replay mode, enabling resuming execution from the last step.
   */
  readonly initialAgentTurns?: ReadonlyMap<string, readonly ConversationTurn[]>;

  /**
   * Input collector function for user agents.
   * Required if the strategy contains any user agents with `requireInput: true`.
   */
  readonly inputCollector?: InputCollector;

  /**
   * Flow hooks to inject into all flows via `hookIntoFlow()` after
   * construction. Useful for the daemon to observe step execution,
   * flow lifecycle, etc.
   */
  readonly flowHooks?: FlowHooks;

  /**
   * Override the model for ALL LLM agents in the strategy.
   *
   * When set, every agent's model string is replaced with this value,
   * regardless of what the strategy file specifies. Format: "providerID/modelID".
   *
   * Useful for the daemon's `--model-override` flag, allowing a single
   * daemon instance to serve any provider/model combination without
   * editing strategy files.
   *
   * @example "github-copilot/gpt-4o"
   */
  readonly modelOverride?: string;

  /**
   * Skill registry to make available to every LLM agent in this strategy.
   *
   * When provided, every agent that lists `load_skill` in its `tools`
   * array can resolve skill names against this registry. The loader also
   * prepends a compact `## Available Skills` block to each agent's
   * `systemPrompt` so the model knows what to ask for. Build the
   * registry with `loadSkills(workspaceRoot)`.
   */
  readonly skillRegistry?: SkillRegistry;

  /**
   * Optional base directory of the strategy file, used to resolve relative paths
   * (such as system prompt file paths).
   */
  readonly strategyDir?: string;

  /**
   * Optional handle for spawning sub-strategies, threaded into every
   * agent's {@link ToolContext} so tools such as `launch_strategy` can
   * delegate to a runtime-supplied implementation (e.g., the daemon
   * executor, which wires the nested run's flow/agent hooks to the
   * parent run's broadcast pipeline).
   *
   * When omitted, `launch_strategy` falls back to an in-process
   * `loadStrategy` + `flow.call()` invocation with no broadcast.
   */
  readonly launchStrategy?: LaunchStrategyHandle;
  /** Optional runtime language service threaded into every agent tool call. */
  readonly languageService?: LanguageService;

  /**
   * Optional run identifier propagated to every agent's
   * {@link AgentConfig.runId} (and from there into each tool's
   * {@link ToolContext.runId}).
   *
   * Distinct from `sessionId` (which scopes the audit log and trash
   * metadata across an entire user/daemon session): `runId` identifies
   * a single strategy invocation. The daemon executor passes the
   * top-level run id here, and gives each `launch_strategy` sub-load
   * a *fresh* derived id, so recursive strategy invocations have
   * isolated state for tools that key on `runId` (notably `todo_*`,
   * which shares state across agents within one invocation but must not
   * leak into recursive sub-runs).
   *
   * When omitted, runId-aware tools fall back to `agentName`-only
   * keying (their original behaviour) — safe for tests and embedded
   * callers that don't care about cross-launch isolation.
   */
  readonly runId?: string;
}

/**
 * The result of loading a strategy — contains the runnable flow
 * and metadata for inspection.
 */
export interface LoadedStrategy {
  /** Strategy name from the file. */
  readonly name: string;
  /** Strategy version from the file. */
  readonly version: string;
  /** Optional description. */
  readonly description?: string;
  /** The instantiated entry flow as a runnable Agent. */
  readonly flow: Agent;
  /** The instantiated agent registry (for inspection/testing). */
  readonly agents: Readonly<Record<string, Agent>>;
  /** The raw validated strategy data (for exporting). */
  readonly raw: Strategy;
}
