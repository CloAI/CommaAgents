import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { DiscoveredStrategy } from "@comma-agents/core/strategy";
import type { RunMessage } from "@comma-agents/daemon";

/** Strategy file and optional project manifest selected for a run. */
export interface ResolvedStrategy {
  readonly strategyPath: string;
  readonly manifestPath?: string;
}

/**
 * Resolve a strategy argument as a file path first, then by discovered name or label (case-insensitive).
 * @param {string} strategy - Path, name, or label given on the command line.
 * @param {string} cwd - Directory relative paths resolve against.
 * @param {readonly DiscoveredStrategy[]} discovered - Strategies found by discovery.
 * @returns {ResolvedStrategy} The strategy file and its project manifest, when any.
 */
export function resolveStrategy(
  strategy: string,
  cwd: string,
  discovered: readonly DiscoveredStrategy[],
): ResolvedStrategy {
  const candidatePath = resolve(cwd, strategy);
  const byPath = discovered.find(
    (discoveredStrategy) => discoveredStrategy.path === candidatePath,
  );
  if (byPath) {
    return { strategyPath: byPath.path, manifestPath: byPath.manifestPath };
  }
  if (existsSync(candidatePath)) {
    return { strategyPath: candidatePath };
  }
  const wanted = strategy.toLowerCase();
  const byName = discovered.find(
    (discoveredStrategy) =>
      discoveredStrategy.name.toLowerCase() === wanted ||
      discoveredStrategy.label.toLowerCase() === wanted,
  );
  if (!byName) {
    const available = discovered.map((entry) => entry.label).join(", ");
    throw new Error(
      `Strategy "${strategy}" not found. Available: ${available}`,
    );
  }
  return { strategyPath: byName.path, manifestPath: byName.manifestPath };
}

/**
 * Join the visible text blocks of a finished agent message; user messages yield nothing.
 * @param {RunMessage} message - Message delivered by the run.
 * @returns {string | undefined} Trimmed text, or undefined when the message has none.
 */
export function agentMessageText(message: RunMessage): string | undefined {
  if (message.role !== "agent") {
    return undefined;
  }
  const text = message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();
  return text.length > 0 ? text : undefined;
}
