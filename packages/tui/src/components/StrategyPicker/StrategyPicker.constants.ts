import type { StrategyOption } from "./StrategyPicker";

/** Built-in strategy options shipped with the TUI package. */
export const BUILT_IN_STRATEGIES: readonly StrategyOption[] = [
  {
    label: "Plan",
    value: "plan",
    description: "Break a goal into actionable steps with iterative review",
  },
  {
    label: "Build",
    value: "build",
    description:
      "Describe what to build — a coder implements, a tester reviews",
  },
  {
    label: "Q&A",
    value: "talk",
    description:
      "Describe what to build — a coder implements, a tester reviews",
  },
] as const;
