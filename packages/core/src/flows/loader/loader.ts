// Flow loader — parse, validate, and instantiate a single flow
// from a standalone description file.
//
// The loader:
// 1. Reads JSON or YAML from a file path or raw string.
// 2. Validates the structure with the FlowDescriptionSchema.
// 3. Resolves agent steps from the caller-provided agent registry.
// 4. Recursively builds nested flow definitions.
// 5. Returns a live Agent (flow) via the appropriate flow factory.

import YAML from "yaml";
import type { Agent } from "../../agents/agent/agent.types";
import { StrategyValidationError } from "../../errors/index";
import { createBroadcastFlow } from "../built-in/broadcast/broadcast-flow";
import { createCycleFlow } from "../built-in/cycle/cycle-flow";
import { createSequentialFlow } from "../built-in/sequential/sequential-flow";
import { hookIntoFlow } from "../hook-into-flow/hook-into-flow";
import type { FlowDescription } from "./loader.schema";
import { FlowDescriptionSchema } from "./loader.schema";
import type { LoadFlowOptions } from "./loader.types";

// loadFlow — from file path

/**
 * Load a single flow from a JSON or YAML description file.
 *
 * Auto-detects format by file extension (`.json`, `.yaml`, `.yml`).
 * Validates the structure, resolves agent references from the provided
 * registry, and returns a live `Agent` (flow) ready to call.
 *
 * @param filePath - Absolute or relative path to the flow description file.
 * @param options  - Agent registry and optional hooks.
 * @returns A live Agent implementing the flow.
 * @throws {StrategyValidationError} If the file is invalid or missing required fields.
 *
 * @example
 * ```ts
 * import { loadAgent, loadFlow } from "@comma-agents/core";
 *
 * const writer = await loadAgent("./agents/writer.yaml");
 * const reviewer = await loadAgent("./agents/reviewer.yaml");
 *
 * const flow = await loadFlow("./flows/review-pipeline.yaml", {
 *   agents: { writer, reviewer },
 * });
 * const result = await flow.call("Write a function that adds two numbers");
 * ```
 */
export async function loadFlow(
  filePath: string,
  options: LoadFlowOptions,
): Promise<Agent> {
  // Validate extension first (cheap check)
  const fileExtension = filePath.split(".").pop()?.toLowerCase();

  let format: "json" | "yaml";
  if (fileExtension === "json") {
    format = "json";
  } else if (fileExtension === "yaml" || fileExtension === "yml") {
    format = "yaml";
  } else {
    throw new StrategyValidationError(
      `Unsupported flow description file extension: .${fileExtension}. Use .json, .yaml, or .yml`,
    );
  }

  // Read the file
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new StrategyValidationError(
      `Flow description file not found: ${filePath}`,
    );
  }

  const content = await file.text();

  return loadFlowFromString(content, format, options);
}

// loadFlowFromString — from raw content

/**
 * Load a single flow from a raw JSON or YAML string.
 *
 * Useful when the content is already in memory (e.g., received over
 * a WebSocket, from a database, or from a test fixture).
 *
 * @param content - The raw flow description string.
 * @param format  - "json" or "yaml".
 * @param options - Agent registry and optional hooks.
 * @returns A live Agent implementing the flow.
 * @throws {StrategyValidationError} If parsing or validation fails.
 *
 * @example
 * ```ts
 * const yaml = `
 * name: review-pipeline
 * type: sequential
 * steps:
 *   - agent: writer
 *   - agent: reviewer
 * `;
 * const flow = loadFlowFromString(yaml, "yaml", {
 *   agents: { writer, reviewer },
 * });
 * ```
 */
export function loadFlowFromString(
  content: string,
  format: "json" | "yaml",
  options: LoadFlowOptions,
): Agent {
  // 1. Parse raw content
  let raw: unknown;
  try {
    if (format === "json") {
      raw = JSON.parse(content);
    } else {
      raw = YAML.parse(content);
    }
  } catch (parseError) {
    throw new StrategyValidationError(
      `Failed to parse flow description ${format.toUpperCase()}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      { cause: parseError },
    );
  }

  // 2. Validate with Zod
  const result = FlowDescriptionSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new StrategyValidationError(
      `Flow description validation failed:\n${issues}`,
      {
        cause: result.error,
      },
    );
  }

  const description = result.data;

  // 3. Build and return the flow
  return buildFlowFromDescription(description, options);
}

// buildFlowFromDescription — recursive flow builder

/**
 * Recursively build a flow description into a runnable Agent.
 *
 * Resolves agent references from the options registry and recurses
 * into nested flow definitions.
 */
function buildFlowFromDescription(
  description: FlowDescription,
  options: LoadFlowOptions,
): Agent {
  const steps = resolveSteps(description.steps, description.name, options);

  let flow: Agent;

  switch (description.type) {
    case "sequential":
      flow = createSequentialFlow({
        name: description.name,
        steps,
      });
      break;

    case "cycle": {
      const cycles =
        description.cycles === "Infinity"
          ? Infinity
          : (description.cycles ?? 1);

      // Resolve observer agent if specified
      const observer = description.observer
        ? resolveAgentReference(
            description.observer,
            description.name,
            options.agents,
          )
        : undefined;

      flow = createCycleFlow({
        name: description.name,
        steps,
        cycles,
        observer,
      });
      break;
    }

    case "broadcast":
      flow = createBroadcastFlow({
        name: description.name,
        steps,
        separator: description.separator,
      });
      break;
  }

  // Inject flow hooks post-creation via hookIntoFlow
  if (options.flowHooks) {
    hookIntoFlow(flow, options.flowHooks);
  }

  return flow;
}

// Step resolution

/**
 * Check if a step object is an agent reference (has an `agent` string field).
 */
function isAgentStep(
  step: unknown,
): step is { readonly agent: string; readonly description?: string } {
  return (
    typeof step === "object" &&
    step !== null &&
    "agent" in step &&
    typeof (step as { agent: unknown }).agent === "string"
  );
}

/**
 * Check if a step object is a nested flow definition (has `type` and `steps` fields).
 */
function isNestedFlowStep(step: unknown): step is FlowDescription {
  return (
    typeof step === "object" &&
    step !== null &&
    "type" in step &&
    "steps" in step &&
    typeof (step as { name: unknown }).name === "string"
  );
}

/**
 * Resolve an array of flow step descriptions into live Agent instances.
 * Steps are either agent references or nested flow definitions.
 */
function resolveSteps(
  steps: readonly unknown[],
  flowName: string,
  options: LoadFlowOptions,
): Agent[] {
  return steps.map((step, stepIndex) => {
    if (isAgentStep(step)) {
      return resolveAgentReference(step.agent, flowName, options.agents);
    }

    if (isNestedFlowStep(step)) {
      return buildFlowFromDescription(step, options);
    }

    throw new StrategyValidationError(
      `Flow "${flowName}" step ${stepIndex} is neither an agent reference nor a flow definition.`,
    );
  });
}

/**
 * Look up a named agent in the registry.
 */
function resolveAgentReference(
  agentName: string,
  flowName: string,
  agents: Readonly<Record<string, Agent>>,
): Agent {
  const agent = agents[agentName];
  if (!agent) {
    const available = Object.keys(agents).join(", ");
    throw new StrategyValidationError(
      `Flow "${flowName}" references agent "${agentName}" which is not defined. ` +
        `Available agents: [${available}].`,
    );
  }
  return agent;
}
