// Debug utility functions — formatting and option resolution.
// Internal helpers, not exported from the package barrel.

import type { Agent } from "@comma-agents/core";
import { breakLines, collapseNewlines, truncateText } from "@comma-agents/utils";
import { DEFAULTS } from "./debug.constants";
import type { DebugOptions, ResolvedDebugOptions } from "./debug.types";

// Re-export string utilities so module-internal consumers (debug.ts, debug.test.ts)
// can continue importing from "./debug.utils".
export { breakLines, collapseNewlines, truncateText };

/** Fill in defaults for any unset options. */
export function resolveOptions(options?: DebugOptions): ResolvedDebugOptions {
  if (!options) return DEFAULTS;
  return {
    truncate: options.truncate ?? 0,
    breakLineAfter: options.breakLineAfter ?? 0,
    collapseNewlines: options.collapseNewlines ?? false,
    showSystemPrompt: options.showSystemPrompt ?? DEFAULTS.showSystemPrompt,
    showTokens: options.showTokens ?? DEFAULTS.showTokens,
    output: options.output ?? DEFAULTS.output,
  };
}

// Text formatting

/**
 * Format text for debug output: optionally collapse newlines, then truncate.
 * Collapse runs first so truncation counts against the flattened length.
 */
export function formatText(text: string, opts: ResolvedDebugOptions): string {
  let result = text;
  if (opts.collapseNewlines) result = collapseNewlines(result);
  result = truncateText(result, opts.truncate);
  return result;
}

/** Format token usage as a readable string. */
export function formatTokens(usage: {
  readonly promptTokens: number;
  readonly completionTokens: number;
}): string {
  return `(${usage.promptTokens} prompt + ${usage.completionTokens} completion tokens)`;
}

// Agent description

/**
 * Print a static description of an agent's configuration.
 *
 * If the agent was created by `createAgent()`, it has a `config` property
 * with system prompt, tools, etc. For flow agents or user agents without
 * config, only the name is printed.
 */
export function describeAgentConfig(agent: Agent, opts: ResolvedDebugOptions): void {
  const emit = (line: string) => opts.output(breakLines(line, opts.breakLineAfter));
  const cfg = agent.config;

  if (!cfg) {
    emit(`[${agent.name}] (no config available)`);
    return;
  }

  if (opts.showSystemPrompt && cfg.systemPrompt) {
    emit(`[${agent.name}] System: ${formatText(cfg.systemPrompt, opts)}`);
  } else {
    emit(`[${agent.name}]`);
  }

  if (cfg.tools) {
    const names = Object.keys(cfg.tools);
    if (names.length > 0) {
      emit(`[${agent.name}] Tools: ${names.join(", ")}`);
    }
  }
}
