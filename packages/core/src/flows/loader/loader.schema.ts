// Flow description schema — Zod validation for standalone flow description files.
//
// A flow description defines a single flow orchestration (not the agents
// themselves). Steps reference agents by name — the caller provides a
// registry of live Agent instances via LoadFlowOptions.
//
// Supported flow types: sequential, cycle, broadcast.

import { z } from "zod";

/**
 * A step that references a named agent from the caller-provided registry.
 *
 * @example
 * ```yaml
 * steps:
 *   - agent: researcher
 *   - agent: writer
 * ```
 */
export const AgentStepDescriptionSchema = z
  .object({
    /** Name of the agent in the caller-provided registry. */
    agent: z.string().min(1),
    /** Optional human-readable description of this step. */
    description: z.string().optional(),
  })
  .strict();

/**
 * A step that is a nested flow definition (recursive).
 * Uses `z.lazy()` to support arbitrarily deep nesting.
 */
export const FlowStepDescriptionSchema: z.ZodType = z.lazy(() =>
  z.union([AgentStepDescriptionSchema, FlowDescriptionSchema]),
);

// Base fields shared by all flow types

const BaseFlowDescriptionFields = {
  /** Unique name for this flow. */
  name: z.string().min(1),
  /** Optional human-readable description. */
  description: z.string().optional(),
  /** Steps to execute — agent references or nested flow definitions. */
  steps: z.array(FlowStepDescriptionSchema).min(1),
};

/** Sequential flow — pipeline where each step receives the previous step's output. */
export const SequentialFlowDescriptionSchema = z
  .object({
    ...BaseFlowDescriptionFields,
    type: z.literal("sequential"),
  })
  .strict();

/** Cycle flow — repeating pipeline with optional observer and cycle count. */
export const CycleFlowDescriptionSchema = z
  .object({
    ...BaseFlowDescriptionFields,
    type: z.literal("cycle"),
    /**
     * Number of cycle iterations. Use `"Infinity"` for infinite loops.
     * @default 1
     */
    cycles: z.union([z.number().int().positive(), z.literal("Infinity")]).optional(),
    /** Name of an observer agent that runs after each cycle. */
    observer: z.string().optional(),
  })
  .strict();

/** Broadcast flow — fan-out where all steps receive the same message. */
export const BroadcastFlowDescriptionSchema = z
  .object({
    ...BaseFlowDescriptionFields,
    type: z.literal("broadcast"),
    /**
     * Separator used to join step responses.
     * @default "\n\n"
     */
    separator: z.string().optional(),
  })
  .strict();

/**
 * Flow description schema — validates a standalone flow description file.
 *
 * Discriminated union on `type` supporting sequential, cycle, and broadcast flows.
 *
 * @example
 * ```yaml
 * name: code-review
 * type: sequential
 * steps:
 *   - agent: writer
 *   - agent: reviewer
 *   - agent: editor
 * ```
 */
export const FlowDescriptionSchema = z.discriminatedUnion("type", [
  SequentialFlowDescriptionSchema,
  CycleFlowDescriptionSchema,
  BroadcastFlowDescriptionSchema,
]);

// Inferred TypeScript types

export type FlowDescription = z.infer<typeof FlowDescriptionSchema>;
