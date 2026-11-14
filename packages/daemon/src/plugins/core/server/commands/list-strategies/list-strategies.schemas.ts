import { z } from "zod/v4";
import type { DiscoveredStrategy } from "@comma-agents/core/strategy";

/** Optional working directory whose `.comma/strategies/` is scanned. */
export const ListStrategiesArgumentsSchema = z
  .object({ cwd: z.string().min(1).optional() })
  .strict();

/** One schema-validated strategy a run can be configured with. */
export const DiscoveredStrategySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  path: z.string(),
  manifestPath: z.string().optional(),
  origin: z.enum([
    "cwd",
    "cwd-project",
    "cwd-root-project",
    "data",
    "data-project",
    "hub-package",
    "bundled",
  ]),
  label: z.string(),
}) satisfies z.ZodType<DiscoveredStrategy>;

/** Discovered strategies plus the candidates that were skipped. */
export const ListStrategiesOutputSchema = z
  .object({
    strategies: z.array(DiscoveredStrategySchema).readonly(),
    warnings: z
      .array(z.object({ path: z.string(), reason: z.string() }))
      .readonly(),
  })
  .strict();
