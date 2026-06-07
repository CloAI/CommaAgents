// Strategy schema — Zod validation schemas and inferred TypeScript types.
//
// A strategy defines:
// 1. A named `agents` registry (user agents or LLM agents)
// 2. A single entry `flow` (a tree of sequential/cycle/broadcast flows)

import { z } from "zod";

import { ModelOptionsSchema } from "../agents/loader/loader.schema";
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
     * Per-call provider options forwarded verbatim to the AI SDK. Used to
     * enable provider-specific features such as Anthropic extended thinking
     * or OpenAI reasoning effort. Shape:
     * `{ <providerId>: { <option>: <value>, ... }, ... }`.
     */
    providerOptions: z.record(z.record(z.unknown())).optional(),
    /**
     * Model-level generation parameters (temperature, maxOutputTokens, topP, seed,
     * etc.). Forwarded to `streamText` as top-level options. Provider-specific
     * features should use `providerOptions` instead.
     */
    modelOptions: ModelOptionsSchema.optional(),
    /**
     * Maximum number of LLM round-trips (steps) per call.
     * Each tool-call + response counts as one step.
     */
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
export const FlowStepSchema: z.ZodType = z.lazy(() =>
  z.union([AgentStepSchema, FlowDefSchema]),
);

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
    agents: z.record(AgentDefSchema),
    flow: FlowDefSchema,
  })
  .strict();

// Project manifest — defines a folder-based strategy project

export const CommaProjectManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().optional(),
    description: z.string().optional(),
    strategies: z.array(z.string()).min(1),
    tools: z.array(z.string()).optional(),
    entry: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
  })
  .strict();

// Inferred TypeScript types

export type UserAgentDef = z.infer<typeof UserAgentDefSchema>;
export type LLMAgentDef = z.infer<typeof LLMAgentDefSchema>;
export type AgentDef = z.infer<typeof AgentDefSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;
export type SequentialFlowDef = z.infer<typeof SequentialFlowDefSchema>;
export type CycleFlowDef = z.infer<typeof CycleFlowDefSchema>;
export type BroadcastFlowDef = z.infer<typeof BroadcastFlowDefSchema>;
export type FlowDef = z.infer<typeof FlowDefSchema>;
export type Strategy = z.infer<typeof StrategySchema>;

export type CommaProjectManifest = z.infer<typeof CommaProjectManifestSchema>;

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
