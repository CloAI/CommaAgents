import type { Meta, StoryObj } from "@storybook/react-vite";
import { McpConnectionFailureModalRender } from "./McpConnectionFailureModal";

const meta: Meta<typeof McpConnectionFailureModalRender> = {
  title: "Components/McpConnectionFailureModal",
  component: McpConnectionFailureModalRender,
  args: {
    failedServers: [
      {
        id: "github",
        source: "global",
        transport: "http",
        enabled: true,
        enabledByDefault: true,
        connected: false,
        toolCount: 0,
        assignedAgents: ["researcher"],
        error: "Authentication failed",
      },
      {
        id: "workspace-files",
        source: "workspace",
        transport: "stdio",
        enabled: true,
        enabledByDefault: false,
        connected: false,
        toolCount: 0,
        assignedAgents: ["builder"],
        error: "Process exited before initialization completed",
      },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const MultipleFailures: Story = {};

export const GenericFailure: Story = {
  args: {
    failedServers: [
      {
        id: "custom-server",
        source: "strategy",
        transport: "sse",
        enabled: true,
        enabledByDefault: true,
        connected: false,
        toolCount: 0,
        assignedAgents: [],
      },
    ],
  },
};
