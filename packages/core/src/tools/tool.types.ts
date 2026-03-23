// Tool type definitions and ToolContext

import type { z } from "zod";

/**
 * Context passed to tool execute functions.
 * Provides information about the calling agent and cancellation support.
 */
export interface ToolContext {
  /** Name of the agent that invoked this tool. */
  readonly agentName: string;
  /** Name of the flow this agent belongs to, if any. */
  readonly flowName?: string;
  /** AbortSignal for cancellation propagation. */
  readonly abort: AbortSignal;
}

/**
 * Result returned from a tool execution.
 */
export interface ToolResult {
  /** The textual output to return to the LLM. */
  readonly output: string;
  /** Optional structured metadata about the execution. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Definition of a tool that an agent can invoke.
 *
 * Tools have a description (for the LLM), Zod-validated parameters,
 * and an async execute function.
 *
 * @typeParam TParams - Zod schema type for the tool's parameters
 */
export interface ToolDef<TParams extends z.ZodType = z.ZodType> {
  /** Human-readable description of what this tool does (sent to the LLM). */
  readonly description: string;
  /** Zod schema that validates and types the tool's parameters. */
  readonly parameters: TParams;
  /** Execute the tool with validated arguments and context. */
  execute(args: z.infer<TParams>, ctx: ToolContext): Promise<ToolResult>;
}
