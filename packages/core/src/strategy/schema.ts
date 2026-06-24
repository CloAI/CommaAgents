// Strategy schema — Zod validation schemas and inferred TypeScript types.
//
// A strategy defines:
// 1. A named `agents` registry (user agents or LLM agents)
// 2. A single entry `flow` (a tree of sequential/cycle/broadcast flows)

import { z } from "zod";

import {
  ConversationContextSchema,
  ModelOptionsSchema,
  OutputSchemaSchema,
} from "../agents/loader/loader.schema";
import { BUILT_IN_AGENT_NAMES } from "../agents/registry/agent-registry.constants";
import { BUILT_IN_FLOW_NAMES } from "../flows/registry/flow-registry.constants";
import type { BUILT_IN_TOOL_NAMES } from "../tools/tool.constants";

export type BuiltInToolName = (typeof BUILT_IN_TOOL_NAMES)[number];

// Agent definitions

/** User agent — collects human input. */
export const UserAgentDefSchema = z
  .object({
    type: z.literal("user"),
    description: z.string().optional(),
    config: z
      .object({
        requireInput: z.boolean().optional(),
        presetMessage: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** LLM agent — backed by a language model. */
export const LLMAgentDefSchema = z
  .object({
    type: z.literal("llm").optional(),
    description: z.string().optional(),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    systemPromptTemplate: z
      .object({
        template: z.string(),
        variables: z
          .record(
            z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.array(z.string()),
              z.record(z.string()),
            ]),
          )
          .optional(),
      })
      .strict()
      .optional(),
    tools: z.array(z.string()).optional(),
    /**
     * Skills whose full instructions must be loaded into this agent's system
     * prompt. All discovered skills remain available through the skill tools.
     */
    skills: z.array(z.string().min(1)).optional(),
    /**
     * Per-call options for provider-specific features such as extended
     * thinking or reasoning effort. Shape:
     * `{ <providerId>: { <option>: <value>, ... }, ... }`.
     */
    providerOptions: z.record(z.record(z.unknown())).optional(),
    /**
     * Provider-independent generation parameters such as temperature,
     * maxOutputTokens, topP, and seed. Provider-specific features belong in
     * `providerOptions` instead.
     */
    modelOptions: ModelOptionsSchema.optional(),
    /** JSON Schema describing the agent's structured output. */
    outputSchema: OutputSchemaSchema.optional(),
    /** Conversation context retention and compaction controls. */
    context: ConversationContextSchema.optional(),
    /**
     * Maximum number of LLM round-trips (steps) per call.
     * Each tool-call + response counts as one step.
     */
    maxSteps: z.number().int().positive().optional(),
  })
  .strict();

/** A custom registered agent with implementation-specific configuration. */
export const CustomAgentDefSchema = z
  .object({
    /** Name registered with `registerAgent`. */
    type: z
      .string()
      .min(1)
      .refine(
        (type) =>
          !BUILT_IN_AGENT_NAMES.includes(
            type as (typeof BUILT_IN_AGENT_NAMES)[number],
          ),
        "Built-in agent types must use their built-in schema.",
      ),
    /** Optional human-readable description. */
    description: z.string().optional(),
    /** Configuration validated by the registered agent type. */
    config: z.record(z.unknown()).optional(),
  })
  .strict();

/** A built-in user, built-in LLM, or registered custom agent definition. */
export const AgentDefSchema = z.union([
  UserAgentDefSchema,
  LLMAgentDefSchema,
  CustomAgentDefSchema,
]);

// Flow steps (recursive)

/** A step that references a named agent from the registry. */
export const AgentStepSchema = z
  .object({
    agent: z.string(),
    description: z.string().optional(),
  })
  .strict();

/**
 * A flow step is either an agent reference or a nested flow definition.
 * Uses z.lazy() to support recursive nesting.
 */
export const FlowStepSchema: z.ZodType = z.lazy(() =>
  z.union([AgentStepSchema, FlowDefSchema]),
);

// Flow definitions (recursive via FlowStepSchema)

const BaseFlowFields = {
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(FlowStepSchema).min(1),
};

export const SequentialFlowDefSchema = z
  .object({
    ...BaseFlowFields,
    type: z.literal("sequential"),
  })
  .strict();

export const CycleFlowDefSchema = z
  .object({
    ...BaseFlowFields,
    type: z.literal("cycle"),
    cycles: z
      .union([z.number().int().positive(), z.literal("Infinity")])
      .optional(),
    observer: z.string().optional(),
    /**
     * Custom break-signal tokens. The cycle ends when the observer's
     * output contains one of these signals per `breakCycleSignalMatch`.
     * Defaults to `["end cycle", "stop", "done"]` — fine for legacy
     * strategies but brittle for verbose observers (e.g. "not done yet"
     * triggers the "done" signal). Prefer a unique token like
     * `"==CYCLE_DONE=="` paired with `breakCycleSignalMatch: "first-line"`.
     */
    breakCycleSignals: z.array(z.string().min(1)).min(1).optional(),
    /**
     * How to match `breakCycleSignals` against the observer's output.
     * One of `"substring"` (legacy default, prone to false positives),
     * `"first-line"` (recommended — observer's verdict is line 1),
     * `"any-line"`, or `"exact"`. See {@link CycleFlowConfig.breakCycleSignalMatch}
     * for full semantics.
     */
    breakCycleSignalMatch: z
      .enum(["substring", "first-line", "any-line", "exact"])
      .optional(),
  })
  .strict();

export const BroadcastFlowDefSchema = z
  .object({
    ...BaseFlowFields,
    type: z.literal("broadcast"),
    separator: z.string().optional(),
  })
  .strict();

/** A custom registered flow with implementation-specific configuration. */
export const CustomFlowDefSchema = z
  .object({
    ...BaseFlowFields,
    type: z
      .string()
      .min(1)
      .refine(
        (type) =>
          !BUILT_IN_FLOW_NAMES.includes(
            type as (typeof BUILT_IN_FLOW_NAMES)[number],
          ),
        "Built-in flow types must use their built-in schema.",
      ),
    config: z.record(z.unknown()).optional(),
  })
  .strict();

const BuiltInFlowDefSchema = z.discriminatedUnion("type", [
  SequentialFlowDefSchema,
  CycleFlowDefSchema,
  BroadcastFlowDefSchema,
]);

/** A built-in or registered custom flow definition. */
export const FlowDefSchema = z.union([
  BuiltInFlowDefSchema,
  CustomFlowDefSchema,
]);

// Top-level strategy

export const StrategySchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    agents: z.record(AgentDefSchema),
    flow: FlowDefSchema,
  })
  .strict();

// Inferred TypeScript types

export type UserAgentDef = z.infer<typeof UserAgentDefSchema>;
export type LLMAgentDef = z.infer<typeof LLMAgentDefSchema>;
export type CustomAgentDef = z.infer<typeof CustomAgentDefSchema>;
export type AgentDef = z.infer<typeof AgentDefSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;
export type SequentialFlowDef = z.infer<typeof SequentialFlowDefSchema>;
export type CycleFlowDef = z.infer<typeof CycleFlowDefSchema>;
export type BroadcastFlowDef = z.infer<typeof BroadcastFlowDefSchema>;
export type CustomFlowDef = z.infer<typeof CustomFlowDefSchema>;
export type FlowDef = z.infer<typeof FlowDefSchema>;
export type Strategy = z.infer<typeof StrategySchema>;

// Type guards

/** Check if an agent definition is a user agent. */
export function isUserAgentDef(
  agentDefinition: AgentDef,
): agentDefinition is UserAgentDef {
  return "type" in agentDefinition && agentDefinition.type === "user";
}

/** Check if an agent definition is an LLM agent. */
export function isLLMAgentDef(
  agentDefinition: AgentDef,
): agentDefinition is LLMAgentDef {
  return (
    !("type" in agentDefinition) ||
    agentDefinition.type === undefined ||
    agentDefinition.type === "llm"
  );
}

/** Check if an agent definition references a registered custom agent type. */
export function isCustomAgentDef(
  agentDefinition: AgentDef,
): agentDefinition is CustomAgentDef {
  return !isUserAgentDef(agentDefinition) && !isLLMAgentDef(agentDefinition);
}

/** Check if a flow step is an agent reference (vs a nested flow). */
export function isAgentStep(step: unknown): step is AgentStep {
  return (
    typeof step === "object" &&
    step !== null &&
    "agent" in step &&
    typeof (step as AgentStep).agent === "string"
  );
}

/** Check if a flow step is a nested flow definition. */
export function isFlowDef(step: unknown): step is FlowDef {
  return (
    typeof step === "object" &&
    step !== null &&
    "type" in step &&
    "steps" in step &&
    typeof (step as FlowDef).name === "string"
  );
}
