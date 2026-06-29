import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTheme } from "../../../../Theme";
import { useSearchInputTheme } from "../../../SearchInput";
import {
  RegisteredProvidersPageRender,
  type RegisteredProvidersPageRenderProps,
} from "./RegisteredProvidersPage";
import type {
  ProviderInfo,
  RegisteredProvidersViewState,
} from "./RegisteredProvidersPage.types";

const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    credentialType: "api",
    authStatus: "configured",
    models: [{ id: "gpt-5" }, { id: "gpt-5-mini" }],
    modelsSource: "merged",
    isCustom: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    credentialType: "api",
    authStatus: "none",
    models: [{ id: "claude-sonnet-4-5" }],
    modelsSource: "catalog",
    isCustom: false,
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    credentialType: "oauth",
    authStatus: "none",
    models: [{ id: "gpt-4.1" }],
    modelsSource: "catalog",
    isCustom: false,
  },
  {
    id: "ollama",
    name: "Ollama",
    credentialType: "none",
    authStatus: "configured",
    models: [{ id: "qwen3" }],
    modelsSource: "live",
    isCustom: false,
  },
];

type ProviderView = "list" | "api-input" | "oauth-confirm";

interface RegisteredProvidersPageStoryProps {
  readonly view: ProviderView;
  readonly selectedIndex: number;
  readonly apiKeyInput: string;
  readonly apiKeyInputError: boolean;
  readonly isPending: boolean;
}

function RegisteredProvidersPageStory({
  view,
  selectedIndex,
  apiKeyInput,
  apiKeyInputError,
  isPending,
}: RegisteredProvidersPageStoryProps): React.ReactElement {
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();
  const registeredProviders = PROVIDERS.filter((provider) => provider.isCustom);
  const viewState: RegisteredProvidersViewState =
    view === "api-input"
      ? { kind: "api-input", provider: PROVIDERS[1]! }
      : view === "oauth-confirm"
        ? { kind: "oauth-confirm", provider: PROVIDERS[2]! }
        : { kind: "list" };
  const statusColor: RegisteredProvidersPageRenderProps["statusColor"] = (
    status,
  ) => (status === "configured" ? tokens.colors.success : tokens.colors.muted);
  const credentialTypeColor: RegisteredProvidersPageRenderProps["credentialTypeColor"] =
    (credentialType) =>
      credentialType === "oauth" ? tokens.colors.primary : tokens.colors.muted;

  return (
    <RegisteredProvidersPageRender
      debugRef={() => {}}
      tokens={tokens}
      searchTheme={searchTheme}
      providers={PROVIDERS}
      unifiedProviders={PROVIDERS}
      filteredRegisteredProviders={registeredProviders}
      query=""
      selectedIndex={selectedIndex}
      onSelectedIndexChange={() => {}}
      viewState={viewState}
      apiKeyInput={apiKeyInput}
      apiKeyInputError={apiKeyInputError}
      isPending={isPending}
      statusColor={statusColor}
      credentialTypeColor={credentialTypeColor}
    />
  );
}

const meta: Meta<typeof RegisteredProvidersPageStory> = {
  title: "Components/CommandPalette/RegisteredProvidersPage",
  component: RegisteredProvidersPageStory,
  args: {
    view: "list",
    selectedIndex: 0,
    apiKeyInput: "",
    apiKeyInputError: false,
    isPending: false,
  },
  argTypes: {
    view: {
      control: "inline-radio",
      options: ["list", "api-input", "oauth-confirm"],
    },
  },
  parameters: { xterm: { cols: 100, rows: 18 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ProviderList: Story = {};

export const ApiKeyInput: Story = {
  args: { view: "api-input", apiKeyInput: "sk-example-key" },
};

export const ApiKeyRequired: Story = {
  args: { view: "api-input", apiKeyInputError: true },
};

export const OAuthConfirmation: Story = {
  args: { view: "oauth-confirm" },
};
