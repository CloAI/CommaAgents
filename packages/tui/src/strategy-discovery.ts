// Strategy discovery — TUI adapter over `@comma-agents/core`.
//
// The actual filesystem scanning + schema validation lives in
// `core/src/strategy/discover/`. This module is now a thin shim that
// maps the rich `DiscoveredStrategy` shape to the TUI's `StrategyOption`
// type and returns a promise (the underlying call is async).

import { discoverStrategies as discoverCoreStrategies } from "@comma-agents/core";

import type { StrategyOption } from "./components/StrategyPicker";

/**
 * Discover all available strategies on disk and return them as
 * `StrategyOption[]` for use by the TUI.
 *
 * Delegates to `@comma-agents/core`'s `discoverStrategies()` (which
 * scans bundled, cwd, and dataDir locations and validates against
 * `StrategySchema`) and adapts each entry to the picker-friendly
 * `{ label, value, description, manifestPath? }` shape.
 */
export async function discoverStrategies(): Promise<readonly StrategyOption[]> {
  const { strategies } = await discoverCoreStrategies();
  return strategies.map((s) => ({
    label: s.label,
    value: s.path,
    description: s.description ?? "",
    ...(s.manifestPath !== undefined ? { manifestPath: s.manifestPath } : {}),
  }));
}
