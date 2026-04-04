// Agent description schema — Zod validation for standalone agent description files.
//
// An agent description defines a single LLM-backed agent (not a workflow).
// The description includes the model string, optional system prompt or
// template, optional tools, and optional generation parameters.
//
// Composition into flows happens externally by loading multiple descriptions
// and passing the resulting agents to existing flow factories.

import { z } from "zod";

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
        z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.record(z.string())]),
      )
      .optional(),
  })
  .strict();

/**
 * Agent description schema — validates a standalone agent description file.
 *
 * @example
 * ```yaml
 * name: researcher
 * model: openai/gpt-4o
 * systemPrompt: You are a research assistant.
 * tools:
 *   - read
 *   - grep
 * ```
 */
export const AgentDescriptionSchema = z
  .object({
    /** Unique name for this agent. */
    name: z.string().min(1),
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
  })
  .strict();

// Inferred TypeScript type

export type AgentDescription = z.infer<typeof AgentDescriptionSchema>;
