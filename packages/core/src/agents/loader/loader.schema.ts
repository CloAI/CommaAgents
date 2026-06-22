// Agent description schema — Zod validation for standalone agent description files.
//
// An agent description defines a single LLM-backed agent (not a workflow).
// The description includes the model string, optional system prompt or
// template, optional tools, and optional generation parameters.
//
// Composition into flows happens externally by loading multiple descriptions
// and passing the resulting agents to existing flow factories.

import { z } from "zod";

import { BUILT_IN_AGENT_NAMES } from "../registry/agent-registry.constants";

/**
 * System prompt template — a Liquid template with optional default variables.
 *
 * Mirrors the `systemPromptTemplate` field from the strategy schema but
 * scoped to a single agent description file.
 */
export const SystemPromptTemplateSchema = z
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
  .strict();

/**
 * Provider-independent generation parameters applied to every model call.
 * Provider-specific features such as extended thinking or reasoning effort
 * belong in `providerOptions` instead.
 */
export const ModelOptionsSchema = z
  .object({
    temperature: z.number().optional(),
    topP: z.number().optional(),
    topK: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    maxRetries: z.number().optional(),
    frequencyPenalty: z.number().optional(),
    presencePenalty: z.number().optional(),
    seed: z.number().optional(),
  })
  .strict();

/** JSON Schema object used for structured agent output in YAML/JSON files. */
export const OutputSchemaSchema = z.record(z.unknown());

/** Serializable conversation context controls for JSON/YAML definitions. */
export const ConversationContextSchema = z
  .object({
    rollingWindow: z
      .union([
        z.number().int().nonnegative(),
        z.object({ maxRecords: z.number().int().nonnegative() }).strict(),
      ])
      .optional(),
    compaction: z
      .union([
        z.boolean(),
        z
          .object({
            keepRecent: z.number().int().nonnegative().optional(),
            threshold: z.number().int().positive().optional(),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();

/**
 * Standalone LLM-backed agent description.
 *
 * @example
 * ```yaml
 * name: researcher
 * model: openai/gpt-4o
 * systemPrompt: You are a research assistant.
 * tools:
 *   - read_file
 *   - search_files
 * ```
 */
export const LLMAgentDescriptionSchema = z
  .object({
    /** Unique name for this agent. */
    name: z.string().min(1),
    /** Built-in LLM agent type. May be omitted. */
    type: z.literal("llm").optional(),
    /** Optional human-readable description. */
    description: z.string().optional(),
    /** Model string in "providerID/modelID" format (e.g., "openai/gpt-4o"). */
    model: z.string().min(1),
    /** Static system prompt sent to the model. Mutually exclusive with systemPromptTemplate. */
    systemPrompt: z.string().optional(),
    /** Dynamic system prompt using Liquid template syntax. */
    systemPromptTemplate: SystemPromptTemplateSchema.optional(),
    /** Tool names to make available to the agent. */
    tools: z.array(z.string()).optional(),
    /**
     * Per-call options for provider-specific features such as extended
     * thinking or reasoning effort. Shape:
     * `{ <providerId>: { <option>: <value>, ... }, ... }`.
     */
    providerOptions: z.record(z.record(z.unknown())).optional(),
    /** Model-level generation parameters (temperature, maxTokens, etc.). */
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

/** Standalone registered agent description with implementation-specific configuration. */
export const CustomAgentDescriptionSchema = z
  .object({
    /** Unique name for this agent. */
    name: z.string().min(1),
    /** Optional human-readable description. */
    description: z.string().optional(),
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
    /** Configuration validated by the registered agent type. */
    config: z.record(z.unknown()).optional(),
  })
  .strict();

/** A standalone built-in LLM or registered custom agent description. */
export const AgentDescriptionSchema = z.union([
  LLMAgentDescriptionSchema,
  CustomAgentDescriptionSchema,
]);

export type LLMAgentDescription = z.infer<typeof LLMAgentDescriptionSchema>;
export type CustomAgentDescription = z.infer<
  typeof CustomAgentDescriptionSchema
>;
export type AgentDescription = z.infer<typeof AgentDescriptionSchema>;
