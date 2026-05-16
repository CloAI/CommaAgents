// PromptTemplate — LiquidJS-backed template engine for system prompts and messages.
//
// Custom filters:
//   {{ "VAR_NAME" | env }}       — resolve from process.env
//   {{ "/path/to/file" | file }} — read first line of file
//   {{ "command" | exec }}       — execute shell command, return stdout

import { readFile } from "node:fs/promises";
import { Liquid } from "liquidjs";
import type {
  PromptTemplate,
  PromptTemplateConfig,
  TemplateVariables,
} from "../types";

// Liquid engine singleton

const engine = new Liquid({
  strictVariables: false,
  strictFilters: true,
  outputEscape: (outputValue) =>
    outputValue === undefined || outputValue === null
      ? ""
      : String(outputValue),
});

// -- env filter --
engine.registerFilter("env", (varName: unknown) => {
  const name = String(varName ?? "");
  if (!name) throw new Error('{{ "VAR" | env }} requires a variable name');
  const value = process.env[name];
  if (value === undefined) throw new Error(`env filter: "${name}" is not set`);
  return value;
});

// -- file filter (async) --
engine.registerFilter("file", async (filePath: unknown) => {
  const resolvedPath = String(filePath ?? "");
  if (!resolvedPath)
    throw new Error('{{ "/path" | file }} requires a file path');
  try {
    const content = await readFile(resolvedPath, "utf-8");
    return content.split("\n")[0]?.trim() ?? "";
  } catch {
    throw new Error(`file filter: could not read "${resolvedPath}"`);
  }
});

// -- exec filter (async) --
engine.registerFilter("exec", async (command: unknown) => {
  const shellCommand = String(command ?? "");
  if (!shellCommand) throw new Error('{{ "cmd" | exec }} requires a command');
  try {
    if (typeof globalThis.Bun !== "undefined") {
      const childProcess = Bun.spawn(["sh", "-c", shellCommand], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(childProcess.stdout).text();
      await childProcess.exited;
      const trimmed = output.trim();
      if (!trimmed) throw new Error("empty output");
      return trimmed;
    }
    const { execSync } = await import("node:child_process");
    const output = execSync(shellCommand, {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    if (!output) throw new Error("empty output");
    return output;
  } catch (error) {
    throw new Error(
      `exec filter: "${shellCommand}" failed — ${error instanceof Error ? error.message : error}`,
    );
  }
});

// createPromptTemplate

/**
 * Create a prompt template backed by LiquidJS.
 *
 * Templates use the full Liquid syntax — `{{ variable }}` interpolation,
 * `{% if %}` / `{% for %}` control flow, filters, and the custom
 * `env`, `file`, `exec` filters.
 *
 * Function-typed variable values are resolved to strings before the
 * Liquid render pass, so `() => string | Promise<string>` still works.
 *
 * @example
 * ```ts
 * const tpl = createPromptTemplate({
 *   template: "You are {{ role }}, an expert in {{ language }}.",
 *   variables: { role: "a code reviewer", language: "TypeScript" },
 * });
 * await tpl.render();               // "You are a code reviewer, an expert in TypeScript."
 * await tpl.render({ language: "Rust" }); // "You are a code reviewer, an expert in Rust."
 * ```
 */
export function createPromptTemplate(
  config: PromptTemplateConfig,
): PromptTemplate {
  const defaults: Record<string, TemplateValue> = config.variables
    ? { ...config.variables }
    : {};

  return {
    template: config.template,
    defaults,
    async render(overrides?: TemplateVariables) {
      // Resolve function values → plain values (parallel)
      const resolve = async (vars: TemplateVariables) => {
        const out: Record<string, unknown> = {};
        await Promise.all(
          Object.entries(vars).map(async ([key, variableValue]) => {
            out[key] =
              typeof variableValue === "function"
                ? await variableValue()
                : variableValue;
          }),
        );
        return out;
      };

      const [base, over] = await Promise.all([
        resolve(defaults),
        overrides ? resolve(overrides) : {},
      ]);

      return engine.parseAndRender(config.template, { ...base, ...over });
    },

    updatePromptVariables(variables: TemplateVariables): void {
      Object.assign(defaults, variables);
    },
  };
}
