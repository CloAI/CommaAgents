import { z } from "zod";

import { discoverStrategies } from "../../../strategy/discover/discover";
import { defineTool } from "../../define/define-tool";
import { okResult } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type {
  ListStrategyData,
  ListStrategyEntry,
} from "./list-strategy.types";

export const listStrategyParams = z.object({});

/**
 * Build the `list_strategy` tool.
 *
 * Enumerates every strategy that {@link discoverStrategies} can find on
 * disk (bundled, cwd `.comma/strategies/`, cwd projects, data dir, data
 * dir projects) and returns them in a structured payload plus a
 * human-readable summary. Strategies that fail schema validation are
 * not included; their paths are surfaced in `data.warnings`.
 */
export function createListStrategyTool(): ToolDefinition<
  typeof listStrategyParams,
  ListStrategyData
> {
  return defineTool<typeof listStrategyParams, ListStrategyData>({
    description: describeTool({
      purpose: [
        "List every strategy currently available to launch with launch_strategy.",
        "Strategies are agent-orchestration files (JSON, JSONC, or YAML) discovered from the bundled set shipped with @comma-agents/core, the workspace `.comma/strategies/` directory, and the platform data dir.",
      ],
      inputs: [
        {
          name: "(none)",
          type: "none",
          required: false,
          description: "This tool takes no parameters.",
        },
      ],
      outputs:
        "`{ strategies, count, warnings }` where each strategy is `{ name, version, description?, path, origin, manifestPath?, label }`. Entries are ordered by discovery priority (bundled → cwd → data) with duplicate paths removed.",
      errors: [],
      notes: [
        "Pass the `name` of any returned entry to `launch_strategy` to run it.",
        "Warnings list strategy files that exist on disk but failed schema validation — they are not available to launch.",
      ],
    }),
    parameters: listStrategyParams,
    execute: async () => {
      const { strategies, warnings } = await discoverStrategies();

      const entries: ListStrategyEntry[] = strategies.map((s) => ({
        name: s.name,
        version: s.version,
        path: s.path,
        origin: s.origin,
        label: s.label,
        ...(s.description !== undefined ? { description: s.description } : {}),
        ...(s.manifestPath !== undefined
          ? { manifestPath: s.manifestPath }
          : {}),
      }));

      const data: ListStrategyData = {
        strategies: entries,
        count: entries.length,
        warnings,
      };

      if (entries.length === 0) {
        const headerLine = "No strategies are currently available to launch.";
        const warningLines = warnings.length
          ? [
              "",
              `Discovery warnings (${warnings.length}):`,
              ...warnings.map((w) => `  - ${w.path}: ${w.reason}`),
            ]
          : [];
        return okResult<ListStrategyData>(
          [headerLine, ...warningLines].join("\n"),
          { data },
        );
      }

      const headerLine = `${entries.length} strategy(s) available:`;
      const strategyLines = entries.map((entry) => {
        const descriptionPart = entry.description
          ? ` — ${entry.description}`
          : "";
        return `  - ${entry.label} [${entry.origin}] (name: ${entry.name})${descriptionPart}`;
      });
      const warningLines = warnings.length
        ? [
            "",
            `Discovery warnings (${warnings.length}):`,
            ...warnings.map((w) => `  - ${w.path}: ${w.reason}`),
          ]
        : [];

      return okResult<ListStrategyData>(
        [headerLine, ...strategyLines, ...warningLines].join("\n"),
        { data },
      );
    },
  });
}
