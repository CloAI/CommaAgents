import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "ink";
import type { ChatMessage } from "../../hooks/useChat/useChat.types";
import { MessageList } from "./MessageList";

/**
 * `MessageList` dispatches each `ChatMessage` to the matching role-specific
 * renderer (`UserMessage`, `AgentMessage`) inside a `ScrollableView` pinned
 * to the bottom by default. There is no keyboard selection — pure scroll.
 */
const sampleMessages: readonly ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    sender: "you",
    text: "Refactor MessageList so each segment kind has its own renderer.",
    streaming: false,
    timestamp: 1_730_491_198_000,
  },
  {
    id: "m2",
    role: "agent",
    sender: "planner",
    text: "I'll start by mapping the existing segment types.",
    segments: [
      {
        type: "text",
        text: "I'll start by mapping the existing segment types.",
        streaming: false,
      },
    ],
    streaming: false,
    timestamp: 1_730_491_201_000,
  },
  {
    id: "m3",
    role: "agent",
    sender: "builder",
    text: "Let me read the package manifest.",
    segments: [
      {
        type: "text",
        text: "Let me read the package manifest.",
        streaming: false,
      },
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
    ],
    streaming: false,
    timestamp: 1_730_491_205_000,
  },
  {
    id: "m4",
    role: "user",
    sender: "you",
    text: "Great. Show me the AgentMessage component file.",
    streaming: false,
    timestamp: 1_730_491_209_000,
  },
  {
    id: "m5",
    role: "agent",
    sender: "builder",
    text: "Streaming output now",
    segments: [
      { type: "text", text: "Streaming output now", streaming: true },
    ],
    streaming: true,
    timestamp: 1_730_491_212_000,
  },
];

const meta: Meta<typeof MessageList> = {
  title: "Components/MessageList",
  component: MessageList,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  render: () => (
    <Box width={70} height={20} flexDirection="column">
      <MessageList messages={sampleMessages} />
    </Box>
  ),
};

export const Empty: Story = {
  render: () => (
    <Box width={70} height={10} flexDirection="column">
      <MessageList messages={[]} />
    </Box>
  ),
};

export const SingleUserMessage: Story = {
  render: () => (
    <Box width={70} height={10} flexDirection="column">
      <MessageList messages={[sampleMessages[0]!]} />
    </Box>
  ),
};

export const StreamingAgent: Story = {
  render: () => (
    <Box width={70} height={20} flexDirection="column">
      <MessageList
        messages={[sampleMessages[0]!, sampleMessages[1]!, sampleMessages[4]!]}
      />
    </Box>
  ),
};
