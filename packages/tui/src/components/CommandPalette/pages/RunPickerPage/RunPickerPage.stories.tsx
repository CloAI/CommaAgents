import type { Meta, StoryObj } from "@storybook/react-vite";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useTheme } from "../../../../Theme";
import { useSearchInputTheme } from "../../../SearchInput";
import { RunPickerPageRender } from "./RunPickerPage";
import type { RunItem } from "./RunPickerPage.types";

const RUNS: readonly RunItem[] = [
  {
    kind: "persisted",
    meta: {
      runId: "run_01JEXAMPLE000000000000001",
      cwd: "/workspace/comma-agents",
      strategyName: "plan-build-review",
      strategyPath: "/workspace/.comma/strategies/plan-build-review.yaml",
      startedAt: "2026-06-28T16:15:00.000Z",
      completedAt: "2026-06-28T16:19:30.000Z",
      status: "completed",
    },
  },
  {
    kind: "persisted",
    meta: {
      runId: "run_01JEXAMPLE000000000000002",
      cwd: "/workspace/comma-agents",
      strategyName: "dependency-audit",
      strategyPath: "/workspace/.comma/strategies/dependency-audit.yaml",
      startedAt: "2026-06-27T10:00:00.000Z",
      completedAt: null,
      status: "error",
    },
  },
  {
    kind: "persisted",
    meta: {
      runId: "run_01JEXAMPLE000000000000003",
      cwd: "/workspace/comma-agents",
      strategyName: "docs-refresh",
      strategyPath: "/workspace/.comma/strategies/docs-refresh.yaml",
      startedAt: "2026-06-26T08:30:00.000Z",
      completedAt: null,
      status: "running",
    },
  },
];

interface RunPickerPageStoryProps {
  readonly query: string;
  readonly selectedIndex: number;
  readonly empty: boolean;
}

function RunPickerPageStory({
  query,
  selectedIndex,
  empty,
}: RunPickerPageStoryProps): React.ReactElement {
  const debug = useDebugRender("RunPickerPageStory", {});
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();
  const items = empty
    ? []
    : RUNS.filter((runItem) =>
        runItem.kind === "persisted"
          ? runItem.meta.strategyName
              .toLowerCase()
              .includes(query.toLowerCase())
          : true,
      );

  return (
    <RunPickerPageRender
      debug={debug}
      tokens={tokens}
      searchTheme={searchTheme}
      query={query}
      items={items}
      selectedIndex={selectedIndex}
      setSelectedIndex={() => {}}
      onSelected={() => {}}
      isFocused={false}
      currentChatRunId={null}
    />
  );
}

const meta: Meta<typeof RunPickerPageStory> = {
  title: "Components/CommandPalette/RunPickerPage",
  component: RunPickerPageStory,
  args: { query: "", selectedIndex: 0, empty: false },
  parameters: { xterm: { cols: 100, rows: 14 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const RecentRuns: Story = {};

export const Filtered: Story = {
  args: { query: "docs" },
};

export const Empty: Story = {
  args: { empty: true },
};
