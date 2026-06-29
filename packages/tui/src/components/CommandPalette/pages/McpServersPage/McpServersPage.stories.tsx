import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTheme } from "../../../../Theme";
import {
  McpServersPageRender,
  type McpServersPageRenderProps,
} from "./McpServersPage";

const SERVERS: McpServersPageRenderProps["servers"] = [
  {
    id: "filesystem",
    source: "workspace",
    transport: "stdio",
    enabled: true,
    enabledByDefault: true,
    connected: true,
    toolCount: 12,
    assignedAgents: ["builder"],
  },
  {
    id: "github",
    source: "global",
    transport: "http",
    enabled: true,
    enabledByDefault: true,
    connected: false,
    toolCount: 0,
    assignedAgents: [],
    error: "Authentication failed",
  },
  {
    id: "browser",
    source: "strategy",
    transport: "sse",
    enabled: false,
    enabledByDefault: false,
    toolCount: 8,
    assignedAgents: ["researcher"],
  },
];

interface McpServersPageStoryProps {
  readonly selectedIndex: number;
  readonly isRunScoped: boolean;
  readonly empty: boolean;
}

function McpServersPageStory({
  selectedIndex,
  isRunScoped,
  empty,
}: McpServersPageStoryProps): React.ReactElement {
  const tokens = useTheme();
  return (
    <McpServersPageRender
      tokens={tokens}
      servers={empty ? [] : SERVERS}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={() => {}}
      onSelected={() => {}}
      isFocused={false}
      isRunScoped={isRunScoped}
    />
  );
}

const meta: Meta<typeof McpServersPageStory> = {
  title: "Components/CommandPalette/McpServersPage",
  component: McpServersPageStory,
  args: { selectedIndex: 0, isRunScoped: false, empty: false },
  parameters: { xterm: { cols: 80, rows: 14 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const DefaultScope: Story = {};

export const FailedConnection: Story = {
  args: { selectedIndex: 1 },
};

export const RunScope: Story = {
  args: { isRunScoped: true },
};

export const Empty: Story = {
  args: { empty: true },
};
