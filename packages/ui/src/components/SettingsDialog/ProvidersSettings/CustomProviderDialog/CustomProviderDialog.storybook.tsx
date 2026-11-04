import type { Meta, StoryObj } from "@storybook/react-vite";
import { act } from "react";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import { CustomProviderDialog } from "./CustomProviderDialog";
import { SettingsProvider } from "../../../../hooks/useSettings";
import { CommaAgentsDaemonProvider } from "../../../../hooks/useCommaAgentsDaemon";
import { MockWebSocket } from "../../../../hooks/useWebSocket/test.utils";
import {
  deliver,
  requests,
} from "../../../../hooks/useCommaAgentsDaemon/test.utils";
import {
  emptyConfiguration,
  loadProviderForm,
  mockProviderSocket,
  openAIProvider,
  providerRequest,
  replyProvider,
} from "../ProviderConfigurationDialog/test.utils";
const customProvider = {
  ...openAIProvider,
  id: "local",
  name: "Local",
  origin: "user" as const,
};
const meta = {
  title: "Components/SettingsDialog/ProvidersSettings/CustomProviderDialog",
  component: CustomProviderDialog,
  args: { onClose: fn(), onChanged: fn() },
  beforeEach: mockProviderSocket,
  decorators: [
    (Story) => (
      <SettingsProvider>
        <CommaAgentsDaemonProvider>
          <div style={{ maxWidth: "32rem" }}>
            <Story />
          </div>
        </CommaAgentsDaemonProvider>
      </SettingsProvider>
    ),
  ],
} satisfies Meta<typeof CustomProviderDialog>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
export const CreateWithoutKey: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await act(() => MockWebSocket.instances.at(-1)!.open());
    await expect(
      requests(MockWebSocket.instances.at(-1)!, "command"),
    ).toHaveLength(0);
    await userEvent.type(canvas.getByLabelText("Provider ID"), "local");
    await userEvent.type(canvas.getByLabelText("Display name"), "Local");
    await userEvent.type(
      canvas.getByLabelText("API base URL"),
      "http://localhost:1234/v1",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const add = await providerRequest("core.providers.addCustomProvider");
    await expect(add.arguments).toEqual({
      id: "local",
      name: "Local",
      baseURL: "http://localhost:1234/v1",
      credentialType: "api",
    });
    await replyProvider(add, customProvider);
    await expect(args.onChanged).toHaveBeenCalledWith({ providerId: "local" });
    await expect(args.onClose).toHaveBeenCalled();
    await expect(
      requests(MockWebSocket.instances.at(-1)!, "command"),
    ).toHaveLength(1);
  },
};
export const OptionalKeyPartialFailureResumesExistingProvider: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await userEvent.type(canvas.getByLabelText("Provider ID"), "local");
    await userEvent.type(canvas.getByLabelText("Display name"), "Local");
    await userEvent.type(
      canvas.getByLabelText("API base URL"),
      "https://example.com/v1",
    );
    await userEvent.type(
      canvas.getByLabelText("API key (optional)"),
      "first-key",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await replyProvider(
      await providerRequest("core.providers.addCustomProvider"),
      customProvider,
    );
    const configure = await providerRequest("core.providers.configure");
    await act(async () =>
      deliver(socket, configure.requestId, {
        type: "response",
        ok: false,
        error: {
          code: "CREDENTIAL_STORAGE_ERROR",
          message: "Credential write failed.",
        },
      }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Provider definition is saved",
    );
    await expect(canvas.getByLabelText("Provider ID")).toBeDisabled();
    await expect(args.onClose).not.toHaveBeenCalled();
    await userEvent.clear(canvas.getByLabelText("API key (optional)"));
    await userEvent.type(
      canvas.getByLabelText("API key (optional)"),
      "second-key",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await replyProvider(
      await providerRequest("core.providers.updateCustomProvider"),
      customProvider,
    );
    await waitFor(() =>
      expect(
        requests(socket, "command").filter(
          (request) => request.command === "core.providers.configure",
        ),
      ).toHaveLength(2),
    );
    await replyProvider(await providerRequest("core.providers.configure"), {
      ...emptyConfiguration,
      providerId: "local",
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "global",
      verificationSupported: false,
      customProvider: {
        name: "Local",
        baseURL: "https://example.com/v1",
        credentialType: "api",
      },
      origin: "catalog",
    });
    await expect(args.onClose).toHaveBeenCalled();
    await expect(
      requests(socket, "command").filter(
        (request) => request.command === "core.providers.addCustomProvider",
      ),
    ).toHaveLength(1);
    await expect(
      requests(socket, "command").filter(
        (request) => request.command === "core.providers.verify",
      ),
    ).toHaveLength(0);
  },
};
export const NoAuthenticationAndURLValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await act(() => MockWebSocket.instances.at(-1)!.open());
    await userEvent.type(canvas.getByLabelText("Provider ID"), "local");
    await userEvent.type(canvas.getByLabelText("Display name"), "Local");
    await userEvent.type(
      canvas.getByLabelText("API base URL"),
      "https://example.com/v1?key=secret",
    );
    await userEvent.selectOptions(
      canvas.getByLabelText("Authentication"),
      "none",
    );
    await expect(
      canvas.queryByLabelText("API key (optional)"),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "without credentials, query parameters",
    );
    await expect(canvas.getByLabelText("API base URL")).toHaveFocus();
    await expect(canvas.getByLabelText("API base URL")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      requests(MockWebSocket.instances.at(-1)!, "command"),
    ).toHaveLength(0);
    await userEvent.clear(canvas.getByLabelText("API base URL"));
    await userEvent.type(
      canvas.getByLabelText("API base URL"),
      "http://localhost:1234/v1",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const add = await providerRequest("core.providers.addCustomProvider");
    await expect(add.arguments?.credentialType).toBe("none");
    await replyProvider(add, { ...customProvider, credentialType: "none" });
  },
};
export const RemoveProvider: Story = {
  args: {
    provider: customProvider,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await loadProviderForm({
      ...emptyConfiguration,
      providerId: "local",
      verificationSupported: false,
      customProvider: {
        name: "Local",
        baseURL: "https://example.com/v1",
        credentialType: "api",
      },
    });
    await expect(canvas.getByLabelText("Provider ID")).toBeDisabled();
    await expect(canvas.getByLabelText("API key (optional)")).toHaveValue("");
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove provider" }),
    );
    await expect(canvas.getByText(/its manual models/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove provider" }),
    );
    await replyProvider(
      await providerRequest("core.providers.removeCustomProvider"),
      { providerId: "local", removed: true },
    );
    await expect(args.onChanged).toHaveBeenCalledWith({ providerId: "local" });
    await expect(args.onClose).toHaveBeenCalled();
    await expect(
      requests(MockWebSocket.instances.at(-1)!, "command").filter(
        (request) => request.command === "core.providers.removeCustomProvider",
      ),
    ).toHaveLength(1);
  },
};
export const ModelsFollowProviderCreation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await userEvent.type(canvas.getByLabelText("Provider ID"), "local");
    await userEvent.type(canvas.getByLabelText("Display name"), "Local");
    await userEvent.type(
      canvas.getByLabelText("API base URL"),
      "http://localhost:1234/v1",
    );
    await userEvent.type(
      canvas.getByLabelText("Models (optional)"),
      "local/first-model\norg/second-model\nfirst-model",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const add = await providerRequest("core.providers.addCustomProvider");
    await expect(requests(socket, "command")).toHaveLength(1);
    await expect(add.arguments).not.toHaveProperty("models");
    await replyProvider(add, customProvider);
    const first = await providerRequest(
      "core.providers.addCustomProviderModel",
    );
    await expect(first.arguments).toEqual({
      providerId: "local",
      modelId: "first-model",
    });
    await replyProvider(first, customProvider);
    await waitFor(() =>
      expect(
        requests(socket, "command").filter(
          (request) =>
            request.command === "core.providers.addCustomProviderModel",
        ),
      ).toHaveLength(2),
    );
    const second = await providerRequest(
      "core.providers.addCustomProviderModel",
    );
    await expect(second.arguments).toEqual({
      providerId: "local",
      modelId: "org/second-model",
    });
    await replyProvider(second, customProvider);
    await expect(args.onChanged).toHaveBeenCalledTimes(1);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(requests(socket, "command")).toHaveLength(3);
  },
};
export const ModelFailureResumesRemainingEntries: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await userEvent.type(canvas.getByLabelText("Provider ID"), "local");
    await userEvent.type(canvas.getByLabelText("Display name"), "Local");
    await userEvent.type(
      canvas.getByLabelText("API base URL"),
      "http://localhost:1234/v1",
    );
    await userEvent.type(
      canvas.getByLabelText("Models (optional)"),
      "first\nsecond",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await replyProvider(
      await providerRequest("core.providers.addCustomProvider"),
      customProvider,
    );
    await replyProvider(
      await providerRequest("core.providers.addCustomProviderModel"),
      customProvider,
    );
    await waitFor(() =>
      expect(
        requests(socket, "command").filter(
          (request) =>
            request.command === "core.providers.addCustomProviderModel",
        ),
      ).toHaveLength(2),
    );
    const failed = await providerRequest(
      "core.providers.addCustomProviderModel",
    );
    await act(async () =>
      deliver(socket, failed.requestId, {
        type: "response",
        ok: false,
        error: {
          code: "PROVIDER_STORAGE_ERROR",
          message: "Model write failed.",
        },
      }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Could not add model second",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await replyProvider(
      await providerRequest("core.providers.updateCustomProvider"),
      customProvider,
    );
    await waitFor(() =>
      expect(
        requests(socket, "command").filter(
          (request) =>
            request.command === "core.providers.addCustomProviderModel",
        ),
      ).toHaveLength(3),
    );
    const retry = await providerRequest(
      "core.providers.addCustomProviderModel",
    );
    await expect(retry.arguments).toEqual({
      providerId: "local",
      modelId: "second",
    });
    await replyProvider(retry, customProvider);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(
      requests(socket, "command").filter(
        (request) => request.command === "core.providers.addCustomProvider",
      ),
    ).toHaveLength(1);
    await expect(
      requests(socket, "command").filter(
        (request) => request.arguments?.modelId === "first",
      ),
    ).toHaveLength(1);
  },
};
