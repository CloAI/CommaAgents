import type { DiscoveredStrategy } from "@comma-agents/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IntroPageRender } from "./IntroPage";
import { useIntroPageTheme } from "./IntroPage.theme";

const STRATEGIES: readonly DiscoveredStrategy[] = [
  {
    name: "plan-build-review",
    version: "1.0.0",
    path: "/workspace/.comma/strategies/plan-build-review.yaml",
    origin: "cwd",
    label: "Plan, Build, Review",
  },
  {
    name: "research",
    version: "1.0.0",
    path: "/workspace/.comma/strategies/research.yaml",
    origin: "bundled",
    label: "Research",
  },
];

type IntroPageScenario = "ready" | "loading" | "empty";

interface IntroPageStoryProps {
  readonly scenario: IntroPageScenario;
}

function IntroPageStory({ scenario }: IntroPageStoryProps): React.ReactElement {
  const theme = useIntroPageTheme();
  const strategies = scenario === "ready" ? STRATEGIES : [];

  return (
    <IntroPageRender
      theme={theme}
      strategies={strategies}
      emptyStrategyLabel={
        scenario === "loading" ? "Loading strategies..." : "No strategies found"
      }
      emptyStrategyPlaceholder={
        scenario === "loading"
          ? "Loading..."
          : "No bundled or user strategies were found."
      }
      onSubmit={() => {}}
      mcpEnabled={2}
      mcpTotal={3}
    />
  );
}

const meta: Meta<typeof IntroPageStory> = {
  title: "Pages/IntroPage",
  component: IntroPageStory,
  args: { scenario: "ready" },
  argTypes: {
    scenario: {
      control: "inline-radio",
      options: ["ready", "loading", "empty"],
    },
  },
  parameters: { xterm: { cols: 100, rows: 30 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const LoadingStrategies: Story = {
  args: { scenario: "loading" },
};

export const NoStrategies: Story = {
  args: { scenario: "empty" },
};
