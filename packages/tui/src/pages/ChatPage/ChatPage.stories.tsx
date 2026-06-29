import type { DiscoveredStrategy } from "@comma-agents/core";
import type {
  RequestPermissionMessage,
  RequestQuestionMessage,
} from "@comma-agents/daemon";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ChatMessage } from "../../hooks/useChat";
import { ChatPageRender } from "./ChatPage";
import { useChatPageTheme } from "./ChatPage.theme";

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

const MESSAGES: readonly ChatMessage[] = [
  {
    id: "page-message-1",
    role: "user",
    sender: "you",
    text: "Review the TUI page coverage and add the missing stories.",
    streaming: false,
    timestamp: 1_782_666_000_000,
  },
  {
    id: "page-message-2",
    role: "agent",
    sender: "planner",
    text: "I found four route-level pages with presentational render surfaces.",
    segments: [
      {
        type: "text",
        text: "I found four route-level pages with presentational render surfaces.",
        streaming: false,
      },
    ],
    streaming: false,
    timestamp: 1_782_666_001_000,
  },
  {
    id: "page-message-3",
    role: "agent",
    sender: "builder",
    text: "Adding the page fixtures now...",
    segments: [
      {
        type: "text",
        text: "Adding the page fixtures now...",
        streaming: true,
      },
    ],
    streaming: true,
    timestamp: 1_782_666_002_000,
  },
];

const PERMISSION_REQUEST: RequestPermissionMessage = {
  type: "request_permission",
  ts: "2026-06-28T16:15:00.000Z",
  requestId: "permission_page_story",
  runId: "run_page_story",
  agentName: "builder",
  toolName: "edit_file",
  operation: "fs.write",
  resource: "packages/tui/src/pages/ChatPage/ChatPage.stories.tsx",
  reason: "policy-ask",
};

const QUESTION_REQUEST: RequestQuestionMessage = {
  type: "request_question",
  ts: "2026-06-28T16:16:00.000Z",
  requestId: "question_page_story",
  runId: "run_page_story",
  agentName: "reviewer",
  question: "Should completed runs expose the continuation composer?",
};

type ChatPageScenario =
  | "running"
  | "waiting-input"
  | "waiting-permission"
  | "waiting-question"
  | "completed";

interface ChatPageStoryProps {
  readonly scenario: ChatPageScenario;
}

function ChatPageStory({ scenario }: ChatPageStoryProps): React.ReactElement {
  const theme = useChatPageTheme();
  const chatStatus =
    scenario === "waiting-input"
      ? "waiting_input"
      : scenario === "waiting-permission"
        ? "waiting_permission"
        : scenario === "waiting-question"
          ? "waiting_question"
          : scenario;

  return (
    <ChatPageRender
      theme={theme}
      messages={MESSAGES}
      chatStatus={chatStatus}
      error={null}
      pendingInputAgent={scenario === "waiting-input" ? "planner" : null}
      pendingPermissionRequest={
        scenario === "waiting-permission" ? PERMISSION_REQUEST : null
      }
      pendingQuestionRequest={
        scenario === "waiting-question" ? QUESTION_REQUEST : null
      }
      activeStrategyPath={STRATEGIES[0]!.path}
      canContinue={scenario === "completed"}
      strategies={STRATEGIES}
      emptyStrategyLabel="No strategies found"
      emptyStrategyPlaceholder="Install a strategy package first."
      onReplySubmit={() => {}}
      onSteerSubmit={() => {}}
      onContinueSubmit={() => {}}
      onPermissionDecide={() => {}}
      onQuestionSubmit={() => {}}
      onAbort={() => {}}
      onOpenSubStrategy={() => {}}
    />
  );
}

const meta: Meta<typeof ChatPageStory> = {
  title: "Pages/ChatPage",
  component: ChatPageStory,
  args: { scenario: "running" },
  argTypes: {
    scenario: {
      control: "select",
      options: [
        "running",
        "waiting-input",
        "waiting-permission",
        "waiting-question",
        "completed",
      ],
    },
  },
  parameters: { xterm: { cols: 100, rows: 30 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Running: Story = {};

export const WaitingForInput: Story = {
  args: { scenario: "waiting-input" },
};

export const WaitingForPermission: Story = {
  args: { scenario: "waiting-permission" },
};

export const WaitingForQuestion: Story = {
  args: { scenario: "waiting-question" },
};

export const Completed: Story = {
  args: { scenario: "completed" },
};
