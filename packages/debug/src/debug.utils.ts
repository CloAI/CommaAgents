// Debug utility functions — formatting and option resolution.
// Internal helpers, not exported from the package barrel.

import type { Agent } from "@comma-agents/core";
import { DEFAULTS } from "./debug.constants";
import type { DebugOptions, ResolvedDebugOptions } from "./debug.types";

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

/** Truncate text to `max` characters, appending "..." if truncated. 0 = no truncation. */
export function truncateText(text: string, max: number): string {
  if (max === 0 || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

/** Replace newlines with visible "\\n" markers for single-line display. */
export function collapseNewlines(text: string): string {
  return text.replace(/\n/g, "\\n");
}

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

/**
 * Word-wrap a single line at the last space before `width` characters.
 *
 * Continuation lines are indented to match the leading whitespace of
 * the original line. If `width` is 0, the line is returned unchanged.
 * If a word is longer than the remaining width on a line, it is placed
 * on the next line (and may exceed `width` if there is no space to
 * break on).
 */
export function breakLines(line: string, width: number): string {
  if (width <= 0 || line.length <= width) return line;

  // Detect leading whitespace for continuation indent
  const match = line.match(/^(\s*)/);
  const indent = match ? match[1] : "";

  const result: string[] = [];
  let remaining = line;

  while (remaining.length > width) {
    // Find the last space at or before `width`
    let breakAt = remaining.lastIndexOf(" ", width);

    // If no space found before width, look for the first space after width
    if (breakAt <= 0) {
      breakAt = remaining.indexOf(" ", width);
    }

    // No space at all — can't break, emit the whole thing
    if (breakAt <= 0) break;

    result.push(remaining.slice(0, breakAt));
    // Skip the space we broke on, add indent for the continuation line
    remaining = indent + remaining.slice(breakAt + 1);
  }

  result.push(remaining);
  return result.join("\n");
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
