// Agent loader — parse, validate, and instantiate a single agent
// from a standalone description file.
//
// The loader:
// 1. Reads JSON or YAML from a file path or raw string.
// 2. Validates the structure with the AgentDescriptionSchema.
// 3. Passes model string and tool names directly to createAgent()
//    (which resolves them internally).
// 4. Builds a system prompt template if defined.
// 5. Returns a live Agent via createAgent().

import { jsonSchema } from "ai";
import YAML from "yaml";
import { StrategyValidationError } from "../../errors/index";
import { createPromptTemplate } from "../../prompts/template/prompt-template";
import { createAgent } from "../agent/agent";
import type { Agent } from "../agent/agent.types";
import { AgentDescriptionSchema } from "./loader.schema";
import type { LoadAgentOptions } from "./loader.types";

// loadAgent — from file path

/**
 * Load a single agent from a JSON or YAML description file.
 *
 * Auto-detects format by file extension (`.json`, `.yaml`, `.yml`).
 * Validates the structure, resolves model and tools, and returns a
 * live `Agent` ready to call.
 *
 * @param filePath - Absolute or relative path to the agent description file.
 * @param options  - Hooks, abort signal.
 *                   Optional — when omitted, global defaults are used for model resolution.
 * @returns A live Agent instance.
 * @throws {StrategyValidationError} If the file is invalid or missing required fields.
 *
 * @example
 * ```ts
 * import { loadAgent } from "@comma-agents/core";
 *
 * // Zero-config — uses global credential store and provider resolver
 * const agent = await loadAgent("./agents/researcher.yaml");
 * const result = await agent.call("What is TypeScript?");
 * ```
 */
export async function loadAgent(
  filePath: string,
  options: LoadAgentOptions = {},
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
      `Unsupported agent description file extension: .${fileExtension}. Use .json, .yaml, or .yml`,
    );
  }

  // Read the file
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new StrategyValidationError(
      `Agent description file not found: ${filePath}`,
    );
  }

  const content = await file.text();

  return await loadAgentFromString(content, format, options);
}

// loadAgentFromString — from raw content

/**
 * Load a single agent from a raw JSON or YAML string.
 *
 * Useful when the content is already in memory (e.g., received over
 * a WebSocket, from a database, or from a test fixture).
 *
 * @param content - The raw agent description string.
 * @param format  - "json" or "yaml".
 * @param options - Hooks, abort signal.
 *                  Optional — when omitted, global defaults are used for model resolution.
 * @returns A live Agent instance.
 * @throws {StrategyValidationError} If parsing or validation fails.
 *
 * @example
 * ```ts
 * const yaml = `
 * name: writer
 * model: openai/gpt-4o
 * systemPrompt: You are a creative writer.
 * `;
 * const agent = await loadAgentFromString(yaml, "yaml");
 * ```
 */
export async function loadAgentFromString(
  content: string,
  format: "json" | "yaml",
  _options: LoadAgentOptions = {},
): Promise<Agent> {
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
      `Failed to parse agent description ${format.toUpperCase()}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      { cause: parseError },
    );
  }

  // 2. Validate with Zod
  const result = AgentDescriptionSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new StrategyValidationError(
      `Agent description validation failed:\n${issues}`,
      {
        cause: result.error,
      },
    );
  }

  const description = result.data;

  // 3. Build system prompt — template takes precedence over static string
  const systemPrompt = description.systemPromptTemplate
    ? createPromptTemplate({
        template: description.systemPromptTemplate.template,
        variables: description.systemPromptTemplate.variables,
      })
    : description.systemPrompt;

  // 4. Create and return the agent — model and tools are resolved internally by createAgent
  return createAgent({
    name: description.name,
    model: description.model,
    systemPrompt,
    tools: description.tools,
    maxSteps: description.maxSteps,
    ...(description.providerOptions
      ? { providerOptions: description.providerOptions }
      : {}),
    ...(description.modelOptions
      ? { modelOptions: description.modelOptions }
      : {}),
    ...(description.outputSchema
      ? { outputSchema: jsonSchema(description.outputSchema) }
      : {}),
  });
}
