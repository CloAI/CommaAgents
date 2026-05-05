// Tool type definitions and ToolContext

import type { z } from "zod";
import type { Sandbox } from "../sandbox/sandbox.types";

/**
 * Context passed to tool execute functions.
 * Provides information about the calling agent, cancellation support,
 * and the sandbox that governs file-system access for this execution.
 */
export interface ToolContext {
  /** Name of the agent that invoked this tool. */
  readonly agentName: string;
  /** Name of the flow this agent belongs to, if any. */
  readonly flowName?: string;
  /** AbortSignal for cancellation propagation. */
  readonly abort: AbortSignal;
  /**
   * Sandbox governing read/write policies and cwd for this tool call.
   * Always present — defaults to a permissive sandbox when none is configured.
   */
  readonly sandbox: Sandbox;
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
 * @typeParam ParameterSchema - Zod schema type for the tool's parameters
 */
export interface ToolDefinition<ParameterSchema extends z.ZodType = z.ZodType> {
  /** Human-readable description of what this tool does (sent to the LLM). */
  readonly description: string;
  /** Zod schema that validates and types the tool's parameters. */
  readonly parameters: ParameterSchema;
  /** Execute the tool with validated arguments and context. */
  execute(
    validatedArguments: z.infer<ParameterSchema>,
    toolContext: ToolContext,
  ): Promise<ToolResult>;
}
