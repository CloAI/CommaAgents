import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "ink";
import type { LogEntry } from "../../hooks/useLogs";
import { LogsPageRender } from "./LogsPage";
import { useLogsPageTheme } from "./LogsPage.theme";

const LOGS: readonly LogEntry[] = [
  {
    id: "log-debug",
    timestamp: 1_782_666_000_000,
    level: "debug",
    message: "Discovered 39 visual TUI modules.",
  },
  {
    id: "log-info",
    timestamp: 1_782_666_001_000,
    level: "info",
    message: "Storybook coverage check completed.",
  },
  {
    id: "log-warning",
    timestamp: 1_782_666_002_000,
    level: "warn",
    message: "Theme barrel emitted an existing circular chunk warning.",
  },
  {
    id: "log-error",
    timestamp: 1_782_666_003_000,
    level: "error",
    message: "Example provider connection failed.",
  },
];

interface LogsPageStoryProps {
  readonly empty: boolean;
}

function LogsPageStory({ empty }: LogsPageStoryProps): React.ReactElement {
  const theme = useLogsPageTheme();
  return (
    <Box width={100} height={20} flexDirection="column">
      <LogsPageRender theme={theme} logs={empty ? [] : LOGS} />
    </Box>
  );
}

const meta: Meta<typeof LogsPageStory> = {
  title: "Pages/LogsPage",
  component: LogsPageStory,
  args: { empty: false },
  parameters: { xterm: { cols: 110, rows: 24 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const CapturedLogs: Story = {};

export const Empty: Story = {
  args: { empty: true },
};
