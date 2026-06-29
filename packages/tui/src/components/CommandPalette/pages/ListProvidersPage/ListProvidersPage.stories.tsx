import type { Meta, StoryObj } from "@storybook/react-vite";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useTheme } from "../../../../Theme";
import { useSearchInputTheme } from "../../../SearchInput";
import {
  ListProvidersPageRender,
  type ListProvidersPageRenderProps,
} from "./ListProvidersPage";

const PROVIDERS: ListProvidersPageRenderProps["providers"] = [
  {
    id: "anthropic",
    name: "Anthropic",
    credentialType: "api",
    authStatus: "configured",
    models: [{ id: "claude-sonnet-4-5" }, { id: "claude-opus-4-1" }],
    modelsSource: "catalog",
    isCustom: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    credentialType: "api",
    authStatus: "none",
    models: [{ id: "gpt-5" }, { id: "gpt-5-mini" }],
    modelsSource: "merged",
    isCustom: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    credentialType: "none",
    authStatus: "configured",
    models: [{ id: "qwen3" }],
    modelsSource: "live",
    isCustom: true,
  },
];

interface ListProvidersPageStoryProps {
  readonly query: string;
  readonly selectedIndex: number;
  readonly loading: boolean;
}

function ListProvidersPageStory({
  query,
  selectedIndex,
  loading,
}: ListProvidersPageStoryProps): React.ReactElement {
  const debug = useDebugRender("ListProvidersPageStory", {});
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();
  const providers = loading ? [] : PROVIDERS;
  const filtered = providers.filter((provider) =>
    provider.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <ListProvidersPageRender
      debug={debug}
      tokens={tokens}
      searchTheme={searchTheme}
      providers={providers}
      query={query}
      selectedIndex={selectedIndex}
      filtered={filtered}
      onSelectedIndexChange={() => {}}
    />
  );
}

const meta: Meta<typeof ListProvidersPageStory> = {
  title: "Components/CommandPalette/ListProvidersPage",
  component: ListProvidersPageStory,
  args: {
    query: "",
    selectedIndex: 0,
    loading: false,
  },
  parameters: { xterm: { cols: 80, rows: 14 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Providers: Story = {};

export const Filtered: Story = {
  args: { query: "open", selectedIndex: 0 },
};

export const Loading: Story = {
  args: { loading: true },
};
