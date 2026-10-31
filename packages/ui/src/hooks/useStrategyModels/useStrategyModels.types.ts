import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";

/** Agents and ordered steps of the selected strategy. */
export type DescribedStrategy =
  DaemonCommandMap["core.strategies.describe"]["result"];

/** One agent in the strategy's registry. */
export type DescribedAgent = DescribedStrategy["agents"][number];

/** Availability of the strategy's models. */
export type StrategyModelsStatus = "loading" | "error" | "none" | "ready";

/** One step of the strategy joined with its agent and any model override. */
export interface StepRow {
  /** Stable identity: the step's position in flow order. */
  readonly key: string;
  /** Name of the owning flow. */
  readonly flow: string;
  /** Nesting level of the owning flow. */
  readonly depth: number;
  /** Whether the step is a normal step or a cycle's observer. */
  readonly role: "step" | "observer";
  /** Step description from the strategy. */
  readonly description?: string;
  /** Agent the step uses. */
  readonly agent: string;
  /** Agent type; only LLM agents have a model. */
  readonly kind: DescribedAgent["kind"];
  /** Agent description from the strategy. */
  readonly agentDescription?: string;
  /** Model declared by the strategy (`providerID/modelID`), with any role resolved. */
  readonly defaultModel?: string;
  /** Role the strategy assigns the agent's model, such as `primary`. */
  readonly modelRole?: string;
  /** Model chosen to replace the declared one. */
  readonly override?: string;
  /** Override when set, otherwise the declared model. */
  readonly effectiveModel?: string;
  /** Inference protections the agent requires of its model. */
  readonly privacy?: DescribedAgent["privacy"];
  /** Number of steps that use this agent. */
  readonly sharedBy: number;
}

/** The one model every LLM agent currently uses, under one set of privacy requirements. */
export interface UniformModel {
  /** Effective model shared by every agent; undefined when none declares one. */
  readonly model: string | undefined;
  /** Protections every agent requires of its model. */
  readonly privacy: DescribedAgent["privacy"];
  /** Distinct LLM agents the model applies to. */
  readonly agents: readonly string[];
  /** Whether any of those agents has an override. */
  readonly overridden: boolean;
}

/** The selected strategy's models and the user's overrides. */
export interface StrategyModels {
  /** Whether the description is loading, failed, has no LLM steps, or is usable. */
  readonly status: StrategyModelsStatus;
  /** Name of the strategy, once described. */
  readonly strategyName?: string;
  /** Steps in flow order. */
  readonly steps: readonly StepRow[];
  /** Set when one model can stand in for all of the strategy's models; otherwise undefined. */
  readonly uniform?: UniformModel;
  /** Number of distinct LLM agents used by the strategy. */
  readonly agentCount: number;
  /** Number of those agents with an override. */
  readonly overriddenCount: number;
  /** Replace the models of the named agents and persist the result. */
  readonly setOverrides: (models: Readonly<Record<string, string>>) => void;
  /** Remove the overrides of the named agents, or of every agent when omitted. */
  readonly clearOverrides: (agents?: readonly string[]) => void;
}

/** Conversation-owned model overrides instead of global new-chat preferences. */
export interface StrategyModelBinding {
  readonly overrides: Readonly<Record<string, string>>;
  readonly modelOverride?: string;
  readonly onChange: (overrides: Readonly<Record<string, string>>) => void;
}
