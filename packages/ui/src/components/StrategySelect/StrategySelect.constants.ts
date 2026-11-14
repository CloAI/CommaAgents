import type { StrategyItem, StrategyStatus } from "../../hooks/useStrategies";

/** Short badge for where a strategy was discovered. */
export const ORIGIN_TAGS: Record<StrategyItem["origin"], string> = {
  cwd: "Project",
  "cwd-project": "Project",
  "cwd-root-project": "Project",
  data: "User",
  "data-project": "User",
  "hub-package": "Hub",
  bundled: "Built-in",
};

/** Heading and filter chip for each origin; bundled strategies are deliberately ungrouped. */
export const ORIGIN_GROUPS: Record<StrategyItem["origin"], string | undefined> =
  {
    cwd: "Project",
    "cwd-project": "Project",
    "cwd-root-project": "Project",
    data: "Project",
    "data-project": "Project",
    "hub-package": "Hub",
    bundled: undefined,
  };

/** Groups in display order. */
export const GROUP_ORDER: readonly string[] = ["Project", "Hub"];

/** Trigger text for each state in which a strategy cannot be chosen. */
export const STATUS_PLACEHOLDERS: Record<StrategyStatus, string> = {
  loading: "Loading strategies...",
  error: "Strategies unavailable",
  empty: "No strategies found",
  ready: "Select strategy",
};
