import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentMessage } from "./AgentMessage";

/**
 * `AgentMessage` renders a single agent's message inside a bordered panel
 * headed by the agent's name. The body is composed of typed segments
 * (text, tool-call, tool-result, thinking). When `streaming` is
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
      {
        type: "text",
        text: "Let me read the package manifest.",
        streaming: false,
      },
      {
        type: "tool-call",
        toolCallId: "call_pkg_read",
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
      {
        type: "text",
        text: "Let me read the package manifest.",
        streaming: false,
      },
      {
        type: "tool-call",
        toolCallId: "call_pkg_read",
        toolName: "fs.read",
        args: '{"path":"/repo/packages/tui/package.json"}',
      },
      {
        type: "tool-result",
        toolCallId: "call_pkg_read",
        toolName: "fs.read",
        output: '{\n  "name": "@comma-agents/tui",\n  "version": "0.4.2"\n}',
        status: "completed",
      },
      {
        type: "text",
        text: "Got it — TUI package at v0.4.2.",
        streaming: false,
      },
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
        toolCallId: "call_apply_patch",
        toolName: "fs.write",
        args: '{"path":"/repo/packages/tui/src/components/MessageList/AgentMessage/AgentMessage.tsx"}',
      },
      { type: "text", text: "Applying the patch now", streaming: true },
    ],
  },
};

/**
 * Showcases the Markdown renderer wired into `text` segments: heading,
 * inline strong/em/code, list, blockquote, fenced code, and a link.
 */
export const MarkdownContent: Story = {
  args: {
    sender: "writer",
    fallbackText: "Markdown sample",
    segments: [
      {
        type: "text",
        text: [
          "## Plan",
          "",
          "We will **refactor** the *renderer* and add `MarkdownView`.",
          "",
          "Steps:",
          "- parse with `marked`",
          "- render via Ink",
          "- keep estimator in sync",
          "",
          "> Long quotes are prefixed with a vertical bar.",
          "",
          "```ts",
          "const x: number = 1;",
          "```",
          "",
          "See [the docs](https://example.com) for details.",
        ].join("\n"),
        streaming: false,
      },
    ],
  },
};

/**
 * Demonstrates that `thinking` segments truncate to the last 5 rendered
 * lines with a leading ellipsis.
 */
export const ThinkingTruncated: Story = {
  args: {
    sender: "planner",
    fallbackText: "Long deliberation",
    segments: [
      {
        type: "thinking",
        id: "reasoning_long",
        text: [
          "step 1: read the spec",
          "step 2: enumerate cases",
          "step 3: sketch the AST",
          "step 4: implement renderer",
          "step 5: write the estimator",
          "step 6: add tests",
          "step 7: ship",
        ].join("\n"),
        streaming: false,
      },
    ],
  },
};
