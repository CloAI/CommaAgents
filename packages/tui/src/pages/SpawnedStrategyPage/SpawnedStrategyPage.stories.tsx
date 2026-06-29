import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ChatMessage } from "../../hooks/useChat";
import { useChatPageTheme } from "../ChatPage/ChatPage.theme";
import { SpawnedStrategyPageRender } from "./SpawnedStrategyPage";

const MESSAGES: readonly ChatMessage[] = [
  {
    id: "spawned-message-1",
    role: "user",
    sender: "parent",
    text: "Review the page-level Storybook coverage.",
    streaming: false,
    timestamp: 1_782_666_000_000,
  },
  {
    id: "spawned-message-2",
    role: "agent",
    sender: "reviewer",
    text: "All four route-level pages now have isolated visual fixtures.",
    segments: [
      {
        type: "text",
        text: "All four route-level pages now have isolated visual fixtures.",
        streaming: false,
      },
    ],
    streaming: false,
    timestamp: 1_782_666_001_000,
  },
];

interface SpawnedStrategyPageStoryProps {
  readonly empty: boolean;
}

function SpawnedStrategyPageStory({
  empty,
}: SpawnedStrategyPageStoryProps): React.ReactElement {
  const theme = useChatPageTheme();
  return (
    <SpawnedStrategyPageRender
      theme={theme}
      strategyName="storybook-review"
      messages={empty ? [] : MESSAGES}
      onOpenSubStrategy={() => {}}
    />
  );
}

const meta: Meta<typeof SpawnedStrategyPageStory> = {
  title: "Pages/SpawnedStrategyPage",
  component: SpawnedStrategyPageStory,
  args: { empty: false },
  parameters: { xterm: { cols: 100, rows: 24 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Transcript: Story = {};

export const EmptyTranscript: Story = {
  args: { empty: true },
};
