import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentMessage } from "./AgentMessage";

/**
 * `AgentMessage` renders a single agent's message inside a bordered panel
 * headed by the agent's name. The body is composed of typed segments
 * (text, tool-call, tool-result, thinking, mcp-call). When `streaming` is
 * true, an in-flight cursor is appended to the latest streaming segment.
 */
const meta: Meta<typeof AgentMessage> = {
  title: "Components/MessageList/AgentMessage",
  component: AgentMessage,
  args: {
    sender: "planner",
    fallbackText: "I'll start by listing the project files.",
    streaming: false,
    segments: [
      {
        type: "text",
        text: "I'll start by listing the project files.",
        streaming: false,
      },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const TextOnly: Story = {};

export const FallbackText: Story = {
  args: {
    sender: "responder",
    fallbackText: "Legacy message body without segments.",
    segments: undefined,
  },
};

export const WithToolCall: Story = {
  args: {
    sender: "builder",
    fallbackText: "Let me read the package manifest.",
    segments: [
      { type: "text", text: "Let me read the package manifest.", streaming: false },
      {
        type: "tool-call",
        toolName: "fs.read",
        args: '{"path":"/repo/packages/tui/package.json"}',
      },
    ],
  },
};

export const WithToolResult: Story = {
  args: {
    sender: "builder",
    fallbackText: "Let me read the package manifest.",
    segments: [
      { type: "text", text: "Let me read the package manifest.", streaming: false },
      {
        type: "tool-call",
        toolName: "fs.read",
        args: '{"path":"/repo/packages/tui/package.json"}',
      },
      {
        type: "tool-result",
        toolName: "fs.read",
        output: '{\n  "name": "@comma-agents/tui",\n  "version": "0.4.2"\n}',
      },
      { type: "text", text: "Got it — TUI package at v0.4.2.", streaming: false },
    ],
  },
};

export const WithThinking: Story = {
  args: {
    sender: "planner",
    fallbackText: "We should refactor the message renderer.",
    segments: [
      {
        type: "thinking",
        id: "reasoning_7f3c",
        text: "The user wants per-segment rendering. I should check whether existing components already split by type, then propose a minimal change.",
        streaming: false,
      },
      {
        type: "text",
        text: "We should refactor the message renderer.",
        streaming: false,
      },
    ],
  },
};

export const Streaming: Story = {
  args: {
    sender: "builder",
    fallbackText: "Applying the patch now",
    streaming: true,
    segments: [
      {
        type: "tool-call",
        toolName: "fs.write",
        args: '{"path":"/repo/packages/tui/src/components/MessageList/AgentMessage/AgentMessage.tsx"}',
      },
      { type: "text", text: "Applying the patch now", streaming: true },
    ],
  },
};

export const McpCall: Story = {
  args: {
    sender: "researcher",
    fallbackText: "Querying remote MCP server.",
    segments: [
      {
        type: "mcp-call",
        serverName: "github",
        toolName: "search_repositories",
        args: '{"query":"ink react terminal","per_page":3}',
        output: "Found 3 results: ink, ink-table, ink-select-input.",
      },
    ],
  },
};
