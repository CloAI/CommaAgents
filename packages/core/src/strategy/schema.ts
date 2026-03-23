// Strategy schema — Zod validation schemas and inferred TypeScript types.
//
// A strategy defines:
// 1. An optional `defaults` block (model, tools, systemPrompt)
// 2. A named `agents` registry (user agents or LLM agents)
// 3. A single entry `flow` (a tree of sequential/cycle/broadcast flows)
//
// Agents with `useDefaults: true` inherit from the defaults block.
// When useDefaults is true, defaults fill in any fields the agent
// does not explicitly define. Agent-level fields always take priority.

import { z } from "zod";

import type { BUILT_IN_TOOL_NAMES } from "./strategy.constants";

export type BuiltInToolName = (typeof BUILT_IN_TOOL_NAMES)[number];

// Defaults

export const StrategyDefaultsSchema = z
  .object({
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
  })
  .strict();

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
    useDefaults: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxSteps: z.number().int().positive().optional(),
  })
  .strict();

/**
 * An agent definition is either a user agent or an LLM agent.
 * Discriminated by the `type` field (user agents must have `type: "user"`,
 * LLM agents may omit `type` or set `type: "llm"`).
 */
export const AgentDefSchema = z.union([UserAgentDefSchema, LLMAgentDefSchema]);

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
export const FlowStepSchema: z.ZodType = z.lazy(() => z.union([AgentStepSchema, FlowDefSchema]));

// Flow definitions (recursive via FlowStepSchema)

const BaseFlowFields = {
  name: z.string(),
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
    cycles: z.union([z.number().int().positive(), z.literal("Infinity")]).optional(),
    observer: z.string().optional(),
  })
  .strict();

export const BroadcastFlowDefSchema = z
  .object({
    ...BaseFlowFields,
    type: z.literal("broadcast"),
    separator: z.string().optional(),
  })
  .strict();

/** A flow definition — discriminated union by `type`. */
export const FlowDefSchema = z.discriminatedUnion("type", [
  SequentialFlowDefSchema,
  CycleFlowDefSchema,
  BroadcastFlowDefSchema,
]);

// Top-level strategy

export const StrategySchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    defaults: StrategyDefaultsSchema.optional(),
    agents: z.record(AgentDefSchema),
    flow: FlowDefSchema,
  })
  .strict();

// Inferred TypeScript types

export type StrategyDefaults = z.infer<typeof StrategyDefaultsSchema>;
export type UserAgentDef = z.infer<typeof UserAgentDefSchema>;
export type LLMAgentDef = z.infer<typeof LLMAgentDefSchema>;
export type AgentDef = z.infer<typeof AgentDefSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;
export type SequentialFlowDef = z.infer<typeof SequentialFlowDefSchema>;
export type CycleFlowDef = z.infer<typeof CycleFlowDefSchema>;
export type BroadcastFlowDef = z.infer<typeof BroadcastFlowDefSchema>;
export type FlowDef = z.infer<typeof FlowDefSchema>;
export type Strategy = z.infer<typeof StrategySchema>;

// Type guards

/** Check if an agent definition is a user agent. */
export function isUserAgentDef(def: AgentDef): def is UserAgentDef {
  return "type" in def && def.type === "user";
}

/** Check if an agent definition is an LLM agent. */
export function isLLMAgentDef(def: AgentDef): def is LLMAgentDef {
  return !("type" in def) || def.type === undefined || def.type === "llm";
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
