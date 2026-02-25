// Strategy exporter — serialize a LoadedStrategy back to JSON or YAML.
//
// The exporter uses the `raw` validated strategy data stored on the
// LoadedStrategy object. This ensures round-trip fidelity — what was
// loaded is what gets exported, without trying to reverse-engineer
// runtime Agent objects back into declarative definitions.

import YAML from "yaml";

import type { LoadedStrategy } from "./loader";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExportStrategyOptions {
  /** Output format. @default "json" */
  readonly format?: "json" | "yaml";
  /** Indentation for JSON output. @default 2 */
  readonly indent?: number;
}

// ---------------------------------------------------------------------------
// exportStrategy
// ---------------------------------------------------------------------------

/**
 * Serialize a loaded strategy back to a JSON or YAML string.
 *
 * Uses the original validated data (`strategy.raw`) for faithful
 * round-trip serialization. This means any fields that were normalized
 * or defaulted during loading are preserved in their original form.
 *
 * @param strategy - A previously loaded strategy.
 * @param options  - Format and indentation options.
 * @returns The serialized strategy string.
 *
 * @example
 * ```ts
 * import { loadStrategy, exportStrategy } from "@comma-agents/core";
 *
 * const strategy = await loadStrategy("./strategy.json", { providers });
 *
 * // Export as JSON (default)
 * const json = exportStrategy(strategy);
 *
 * // Export as YAML
 * const yaml = exportStrategy(strategy, { format: "yaml" });
 * ```
 */
export function exportStrategy(strategy: LoadedStrategy, options?: ExportStrategyOptions): string {
  const format = options?.format ?? "json";
  const indent = options?.indent ?? 2;

  if (format === "yaml") {
    return YAML.stringify(strategy.raw, { indent });
  }

  return JSON.stringify(strategy.raw, null, indent);
}
