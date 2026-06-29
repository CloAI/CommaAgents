import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { darkTheme } from "../../../../Theme/themes/dark";
import type { SearchInputTheme } from "../../../SearchInput";
import {
  RegisteredProvidersPageRender,
  type RegisteredProvidersPageRenderProps,
} from "./RegisteredProvidersPage";
import type { ProviderInfo } from "./RegisteredProvidersPage.types";

type ProviderSeed = Pick<ProviderInfo, "id" | "name"> &
  Partial<Omit<ProviderInfo, "id" | "name">>;

const searchTheme: SearchInputTheme = {
  inputBorder: {
    borderStyle: "round",
    borderColor: darkTheme.colors.primary,
    paddingX: 1,
    width: "100%",
  },
  prompt: {
    color: darkTheme.colors.primary,
    bold: true,
  },
  query: {
    color: darkTheme.colors.primary,
  },
  placeholder: {
    color: darkTheme.colors.muted,
    dimColor: true,
  },
};

function createProvider({
  id,
  name,
  credentialType = "api",
  authStatus = "none",
  models = [{ id: `${id}-model` }],
  modelsSource = "catalog",
  isCustom = false,
  fetchedAt,
  error,
}: ProviderSeed): ProviderInfo {
  return {
    id,
    name,
    credentialType,
    authStatus,
    models,
    modelsSource,
    ...(fetchedAt !== undefined ? { fetchedAt } : {}),
    ...(error !== undefined ? { error } : {}),
    isCustom,
  };
}

function createRenderProps(
  overrides: Partial<RegisteredProvidersPageRenderProps> = {},
): RegisteredProvidersPageRenderProps {
  const providers = overrides.providers ?? [];

  return {
    debugRef: () => {},
    tokens: darkTheme,
    searchTheme,
    providers,
    unifiedProviders: providers,
    filteredRegisteredProviders: providers.filter(
      (provider) => provider.isCustom,
    ),
    query: "",
    selectedIndex: 0,
    onSelectedIndexChange: () => {},
    viewState: { kind: "list" },
    apiKeyInput: "",
    apiKeyInputError: false,
    isPending: false,
    statusColor: (status) =>
      status === "configured"
        ? darkTheme.colors.success
        : darkTheme.colors.muted,
    credentialTypeColor: (credentialType) =>
      credentialType === "oauth"
        ? darkTheme.colors.secondary
        : darkTheme.colors.muted,
    ...overrides,
  };
}

describe("RegisteredProvidersPageRender", () => {
  it("should render API key entry as an explicit masked input field", () => {
    const provider = createProvider({ id: "openai", name: "OpenAI" });

    const { lastFrame } = render(
      <RegisteredProvidersPageRender
        {...createRenderProps({
          viewState: { kind: "api-input", provider },
          apiKeyInput: "sk-test",
        })}
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Register OpenAI");
    expect(frame).toContain("API key");
    expect(frame).toContain("•••••••");
    expect(frame).toContain("7 characters entered");
    expect(frame).not.toContain("sk-test");
  });

  it("should show validation feedback when the API key is empty", () => {
    const provider = createProvider({ id: "anthropic", name: "Anthropic" });

    const { lastFrame } = render(
      <RegisteredProvidersPageRender
        {...createRenderProps({
          viewState: { kind: "api-input", provider },
          apiKeyInputError: true,
        })}
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Paste API key...");
    expect(frame).toContain("API key is required.");
  });

  it("should keep provider sections outside virtualized rows", () => {
    const registeredProvider = createProvider({
      id: "openai",
      name: "OpenAI",
      authStatus: "configured",
      isCustom: true,
    });
    const availableProvider = createProvider({
      id: "anthropic",
      name: "Anthropic",
    });
    const providers = [registeredProvider, availableProvider];

    const { lastFrame } = render(
      <RegisteredProvidersPageRender
        {...createRenderProps({
          providers,
          unifiedProviders: providers,
          filteredRegisteredProviders: [registeredProvider],
        })}
      />,
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Registered 1 · Available 1");
    expect(frame).toContain("Enter to unregister selected provider");
  });
});
