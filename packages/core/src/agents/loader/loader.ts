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

import YAML from "yaml";
import { jsonSchema } from "ai";
import { StrategyValidationError } from "../../errors/index";
import { createPromptTemplate } from "../../prompts/template/prompt-template";
import { createAgent } from "../agent/agent";
import type { Agent } from "../agent/agent.types";
import { AgentDescriptionSchema } from "./loader.schema";
import type { AgentTypeRuntime } from "../registry/agent-registry.types";
import { resolveRegisteredAgent } from "../registry/agent-registry";

// loadAgent — from file path

/**
 * Load a single agent from a JSON or YAML description file.
 *
 * Auto-detects format by file extension (`.json`, `.yaml`, `.yml`).
 * Validates the structure, resolves model and tools, and returns a
 * live `Agent` ready to call.
 *
 * @param {string} filePath - Absolute or relative path to the agent description file.
 * @param {AgentTypeRuntime} [options] - Trusted runtime services and optional model override.
 * @returns {Promise<Agent>} A live Agent instance.
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
  options: AgentTypeRuntime = {},
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
 * @param {string} content - The raw agent description string.
 * @param {"json" | "yaml"} format - Description encoding.
 * @param {AgentTypeRuntime} [options] - Trusted runtime services and optional model override.
 * @returns {Promise<Agent>} A live Agent instance.
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
  options: AgentTypeRuntime = {},
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

  if (!("model" in description)) {
    const registered = resolveRegisteredAgent(description.type);
    if (!registered) {
      throw new StrategyValidationError(
        `Unknown registered agent type: ${description.type}`,
      );
    }
    return registered.create({
      name: description.name,
      config: description.config ?? {},
      runtime: options,
    });
  }

  // 3. Build system prompt — template takes precedence over static string
  const systemPrompt = description.systemPromptTemplate
    ? createPromptTemplate({
        template: description.systemPromptTemplate.template,
        variables: description.systemPromptTemplate.variables,
      })
    : description.systemPrompt;

  // 4. Create and return the agent — model and tools are resolved internally by createAgent
  return createAgent(
    {
      name: description.name,
      model: options.modelOverride ?? description.model,
      systemPrompt,
      tools: description.tools,
      privacy: description.privacy,
      providerOptions: description.providerOptions,
      modelOptions: description.modelOptions,
      outputSchema: description.outputSchema
        ? jsonSchema(description.outputSchema)
        : undefined,
      context: description.context,
      maxSteps: description.maxSteps,
    },
    options,
  );
}
