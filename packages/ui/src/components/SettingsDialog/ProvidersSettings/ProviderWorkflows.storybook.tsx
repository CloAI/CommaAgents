import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import { SettingsProvider } from "../../../hooks/useSettings";
import { CommaAgentsDaemonProvider } from "../../../hooks/useCommaAgentsDaemon";
import {
  deliver,
  requests,
} from "../../../hooks/useCommaAgentsDaemon/test.utils";
import { MockWebSocket } from "../../../hooks/useWebSocket/test.utils";
import { ProvidersSettings } from "./ProvidersSettings";
import {
  mockProviderSocket,
  providerRequest,
  publishProviders,
  replyProvider,
  openAIProvider,
  emptyConfiguration,
} from "./ProviderConfigurationDialog/test.utils";
import type { DiscoveredProvider } from "./ProvidersSettings.types";
const meta = {
  title: "Components/SettingsDialog/ProvidersSettings/Workflows",
  component: ProvidersSettings,
  args: { onClose: fn() },
  beforeEach: mockProviderSocket,
  decorators: [
    (Story) => (
      <SettingsProvider>
        <CommaAgentsDaemonProvider>
          <Story />
        </CommaAgentsDaemonProvider>
      </SettingsProvider>
    ),
  ],
} satisfies Meta<typeof ProvidersSettings>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
/** Load the real browser with a zero-model provider through the daemon routing layer.
 * @returns {Promise<void>} Resolves after provider discovery.
 */
async function load() {
  await act(() => MockWebSocket.instances.at(-1)!.open());
  await publishProviders([openAIProvider]);
}
export const SaveVerifyReload: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await load();
    await expect(
      canvas.getByRole("button", { name: /OpenAI.*0 models/ }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Connect OpenAI" }),
    );
    await replyProvider(
      await providerRequest("core.providers.getConfiguration"),
      emptyConfiguration,
    );
    const dialog = within(
      canvas.getByRole("dialog", { name: "Connect OpenAI" }),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "new-key");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    const configure = await providerRequest("core.providers.configure");
    await expect(configure.arguments).toEqual({
      providerId: "openai",
      apiKey: "new-key",
    });
    await replyProvider(configure, {
      ...emptyConfiguration,
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "global",
      origin: "catalog",
    });
    await replyProvider(await providerRequest("core.providers.verify"), {
      providerId: "openai",
      status: "verified",
      checkedAt: "2026-10-24T12:00:00Z",
    });
    await publishProviders([
      {
        ...openAIProvider,
        authStatus: "configured",
        origin: "catalog",
      },
    ]);
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("img", { name: /OpenAI: Verified/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Configure OpenAI" }),
    ).toBeVisible();
  },
};
export const FailedVerificationContinue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await load();
    await userEvent.click(
      canvas.getByRole("button", { name: "Connect OpenAI" }),
    );
    await replyProvider(
      await providerRequest("core.providers.getConfiguration"),
      emptyConfiguration,
    );
    const dialog = within(canvas.getByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("API key"),
      "saved-but-rejected",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await replyProvider(await providerRequest("core.providers.configure"), {
      ...emptyConfiguration,
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "global",
      origin: "catalog",
    });
    await replyProvider(await providerRequest("core.providers.verify"), {
      providerId: "openai",
      status: "invalid_credentials",
      checkedAt: "2026-10-24T12:00:00Z",
    });
    await publishProviders([
      {
        ...openAIProvider,
        authStatus: "configured",
        origin: "catalog",
      },
    ]);
    await expect(canvas.getAllByRole("dialog")).toHaveLength(1);
    await expect(dialog.getByRole("alert")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Continue" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("img", {
        name: /OpenAI: Connected.*Verification: invalid_credentials/,
      }),
    ).toHaveAttribute("data-status", "warning");
  },
};
export const CreateWithoutKey: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await load();
    await userEvent.click(canvas.getByRole("button", { name: "+ Provider" }));
    const dialog = within(
      canvas.getByRole("dialog", { name: "Add Custom Provider" }),
    );
    await userEvent.type(dialog.getByLabelText("Provider ID"), "custom");
    await userEvent.type(
      dialog.getByLabelText("Display name"),
      "Custom Endpoint",
    );
    await userEvent.type(
      dialog.getByLabelText("API base URL"),
      "http://localhost:1234/v1",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    const add = await providerRequest("core.providers.addCustomProvider");
    await expect(add.arguments).toEqual({
      id: "custom",
      name: "Custom Endpoint",
      baseURL: "http://localhost:1234/v1",
      credentialType: "api",
    });
    const provider: DiscoveredProvider = {
      ...openAIProvider,
      id: "custom",
      name: "Custom Endpoint",
      origin: "user",
    };
    await replyProvider(add, provider);
    await publishProviders([openAIProvider, provider]);
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Connect Custom Endpoint" }),
    ).toBeVisible();
  },
};
export const ShowsListError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await waitFor(() =>
      expect(requests(socket, "subscribe").length).toBeGreaterThan(0),
    );
    await act(() =>
      deliver(socket, requests(socket, "subscribe").at(-1)!.requestId, {
        type: "response",
        ok: false,
        error: { code: "TEMPORARY", message: "Try again" },
      }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent("Try again");
  },
};
export const RefreshModels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const anthropic: DiscoveredProvider = {
      ...openAIProvider,
      id: "anthropic",
      name: "Anthropic",
      models: [
        {
          id: "other-model",
          sources: ["provider"],
          metadata: { name: "Other Model" },
        },
      ],
    };
    await act(() => MockWebSocket.instances.at(-1)!.open());
    await publishProviders([
      {
        ...openAIProvider,
        models: [
          {
            id: "old-model",
            sources: ["provider"],
            metadata: { name: "Old Model" },
          },
        ],
      },
      anthropic,
    ]);
    const search = canvas.getByRole("searchbox");
    await userEvent.type(search, "Model");
    await userEvent.click(
      canvas.getByRole("button", { name: /OpenAI.*1 model/ }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Refresh" }));
    const request = await providerRequest("core.providers.refresh");
    await expect(request.arguments).toEqual({});
    await expect(
      canvas.getByRole("button", { name: "Refreshing..." }),
    ).toBeDisabled();
    await replyProvider(request, {});
    await publishProviders(
      [
        {
          ...openAIProvider,
          models: [
            {
              id: "new-model",
              sources: ["provider"],
              metadata: { name: "New Model" },
            },
          ],
        },
        anthropic,
      ],
      false,
    );
    const modelList = canvas.getByRole("list", { name: "OpenAI models" });
    await expect(modelList).toHaveTextContent("New Model");
    await expect(modelList).not.toHaveTextContent("Old Model");
    await expect(search).toHaveValue("Model");
    await expect(
      canvas.getByRole("button", { name: /Anthropic.*1 model/ }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Refresh" })).toBeEnabled();
  },
};
