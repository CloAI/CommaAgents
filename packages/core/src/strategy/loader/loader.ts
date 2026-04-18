// Strategy loader — parse, validate, and instantiate a strategy file
// into a runnable Agent tree.
//
// The loader:
// 1. Reads JSON or YAML from a file path or raw string.
// 2. Validates the structure with the Zod strategy schema.
// 3. Instantiates agents (LLM-backed or user agents) from definitions.
// 4. Builds the flow tree recursively (sequential / cycle / broadcast).
// 5. Returns a LoadedStrategy with the entry flow as a runnable Agent.
//
// Model and tool resolution happen internally via global registries
// (registerModel / registerProvider / registerTool). Callers must
// configure those registries before loading a strategy.

import YAML from "yaml";

import { StrategyValidationError } from "../../errors/index";
import { StrategySchema } from "../schema";
import type { LoadedStrategy, LoadStrategyOptions } from "./loader.types";
import { buildAgentRegistry, buildFlow } from "./loader.utils";

// loadStrategy — from file path

/**
 * Load a strategy from a JSON or YAML file.
 *
 * Auto-detects format by file extension (`.json`, `.yaml`, `.yml`).
 * Validates the structure, instantiates agents and flows, and returns
 * a runnable `LoadedStrategy`.
 *
 * Model and tool resolution happen via global registries. Call
 * `registerModel()` / `registerProvider()` / `registerTool()` before
 * loading a strategy.
 *
 * @param filePath - Absolute or relative path to the strategy file.
 * @param options  - Input collector, flow hooks, model override.
 * @returns The loaded strategy with a runnable entry flow.
 * @throws {StrategyValidationError} If the file is invalid or missing required fields.
 *
 * @example
 * ```ts
 * import { loadStrategy, registerProvider } from "@comma-agents/core";
 *
 * registerProvider("openai", (modelId) => openai(modelId));
 * const strategy = await loadStrategy("./strategy.json");
 * ```
 */
export async function loadStrategy(
  filePath: string,
  options: LoadStrategyOptions = {},
): Promise<LoadedStrategy> {
  // Validate extension first (cheap check)
  const fileExtension = filePath.split(".").pop()?.toLowerCase();

  let format: "json" | "yaml";
  if (fileExtension === "json") {
    format = "json";
  } else if (fileExtension === "yaml" || fileExtension === "yml") {
    format = "yaml";
  } else {
    throw new StrategyValidationError(
      `Unsupported strategy file extension: .${fileExtension}. Use .json, .yaml, or .yml`,
    );
  }

  // Read the file
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new StrategyValidationError(`Strategy file not found: ${filePath}`);
  }

  const content = await file.text();

  return await loadStrategyFromString(content, format, options);
}

// loadStrategyFromString — from raw content

/**
 * Load a strategy from a raw JSON or YAML string.
 *
 * Useful when the content is already in memory (e.g., received over
 * a WebSocket from the TUI, or from a test fixture).
 *
 * @param content - The raw strategy string.
 * @param format  - "json" or "yaml".
 * @param options - Input collector, hooks, abort signal, model override.
 * @returns The loaded strategy with a runnable entry flow.
 * @throws {StrategyValidationError} If parsing or validation fails.
 */
export async function loadStrategyFromString(
  content: string,
  format: "json" | "yaml",
  options: LoadStrategyOptions = {},
): Promise<LoadedStrategy> {
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
      `Failed to parse strategy ${format.toUpperCase()}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      { cause: parseError },
    );
  }

  // 2. Validate with Zod
  const result = StrategySchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new StrategyValidationError(`Strategy validation failed:\n${issues}`, {
      cause: result.error,
    });
  }

  const strategy = result.data;

  // 3. Instantiate agents
  const agents = await buildAgentRegistry(strategy, options);

  // 4. Build the flow tree
  const flow = buildFlow(strategy.flow, agents, options);

  return {
    name: strategy.name,
    version: strategy.version,
    description: strategy.description,
    flow,
    agents,
    raw: strategy,
  };
}
