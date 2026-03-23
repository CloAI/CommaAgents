// PromptTemplate — LiquidJS-backed template engine for system prompts and messages.
//
// Custom filters:
//   {{ "VAR_NAME" | env }}       — resolve from process.env
//   {{ "/path/to/file" | file }} — read first line of file
//   {{ "command" | exec }}       — execute shell command, return stdout

import { readFile } from "node:fs/promises";
import { Liquid } from "liquidjs";
import type { PromptTemplate, PromptTemplateConfig, TemplateVariables } from "../types";

// Liquid engine singleton

const engine = new Liquid({
  strictVariables: false,
  strictFilters: true,
  outputEscape: (v) => (v === undefined || v === null ? "" : String(v)),
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
  const p = String(filePath ?? "");
  if (!p) throw new Error('{{ "/path" | file }} requires a file path');
  try {
    const content = await readFile(p, "utf-8");
    return content.split("\n")[0]?.trim() ?? "";
  } catch {
    throw new Error(`file filter: could not read "${p}"`);
  }
});

// -- exec filter (async) --
engine.registerFilter("exec", async (command: unknown) => {
  const cmd = String(command ?? "");
  if (!cmd) throw new Error('{{ "cmd" | exec }} requires a command');
  try {
    if (typeof globalThis.Bun !== "undefined") {
      const proc = Bun.spawn(["sh", "-c", cmd], { stdout: "pipe", stderr: "pipe" });
      const output = await new Response(proc.stdout).text();
      await proc.exited;
      const trimmed = output.trim();
      if (!trimmed) throw new Error("empty output");
      return trimmed;
    }
    const { execSync } = await import("node:child_process");
    const output = execSync(cmd, { encoding: "utf-8", timeout: 10_000 }).trim();
    if (!output) throw new Error("empty output");
    return output;
  } catch (err) {
    throw new Error(`exec filter: "${cmd}" failed — ${err instanceof Error ? err.message : err}`);
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
export function createPromptTemplate(config: PromptTemplateConfig): PromptTemplate {
  const defaults: TemplateVariables = config.variables ?? {};

  return {
    template: config.template,
    defaults,
    async render(overrides?: TemplateVariables) {
      // Resolve function values → plain values (parallel)
      const resolve = async (vars: TemplateVariables) => {
        const out: Record<string, unknown> = {};
        await Promise.all(
          Object.entries(vars).map(async ([k, v]) => {
            out[k] = typeof v === "function" ? await v() : v;
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
  };
}
