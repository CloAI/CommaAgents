import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ProviderConfigurationDialog } from "./ProviderConfigurationDialog";
import { SettingsProvider } from "../../../../hooks/useSettings";
import { CommaAgentsDaemonProvider } from "../../../../hooks/useCommaAgentsDaemon";
import { MockWebSocket } from "../../../../hooks/useWebSocket/test.utils";
import { requests } from "../../../../hooks/useCommaAgentsDaemon/test.utils";
import {
  emptyConfiguration,
  loadProviderForm,
  mockProviderSocket,
  openAIProvider,
  providerRequest,
  replyProvider,
} from "./test.utils";
const meta = {
  title:
    "Components/SettingsDialog/ProvidersSettings/ProviderConfigurationDialog",
  component: ProviderConfigurationDialog,
  args: {
    provider: openAIProvider,
    onClose: fn(),
    onChanged: fn(),
    onEditCustom: fn(),
  },
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
} satisfies Meta<typeof ProviderConfigurationDialog>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
export const SaveAndVerify: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await loadProviderForm();
    const input = canvas.getByLabelText("API key");
    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveValue("");
    await userEvent.type(input, "new-secret");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const configure = await providerRequest("core.providers.configure");
    await expect(configure.arguments).toEqual({
      providerId: "openai",
      apiKey: "new-secret",
    });
    await expect(
      requests(MockWebSocket.instances.at(-1)!).filter(
        (request) => request.command === "core.providers.verify",
      ),
    ).toHaveLength(0);
    await replyProvider(configure, {
      ...emptyConfiguration,
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "global",
    });
    const verify = await providerRequest("core.providers.verify");
    const verification = {
      providerId: "openai",
      status: "verified",
      checkedAt: "2026-10-24T12:00:00.000Z",
    };
    await replyProvider(verify, verification);
    await expect(args.onChanged).toHaveBeenCalledWith({
      providerId: "openai",
      verification,
    });
    await expect(args.onClose).toHaveBeenCalled();
  },
};
export const VerificationFailureKeepsDraft: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await loadProviderForm();
    await userEvent.type(canvas.getByLabelText("API key"), "rejected-key");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await replyProvider(await providerRequest("core.providers.configure"), {
      ...emptyConfiguration,
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "global",
    });
    await replyProvider(await providerRequest("core.providers.verify"), {
      providerId: "openai",
      status: "invalid_credentials",
      checkedAt: "2026-10-24T12:00:00.000Z",
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent("rejected");
    await expect(
      canvas.getByRole("button", { name: "Continue" }),
    ).toBeVisible();
    await expect(args.onClose).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(canvas.getByLabelText("New API key (optional)")).toHaveValue(
      "rejected-key",
    );
    await expect(
      requests(MockWebSocket.instances.at(-1)!, "command"),
    ).toHaveLength(3);
  },
};
export const VerifiesSavedKeyAndCloses: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await loadProviderForm({
      ...emptyConfiguration,
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "global",
    });
    await expect(canvas.getByLabelText("New API key (optional)")).toHaveValue(
      "",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    const verification = {
      providerId: "openai",
      status: "verified",
      checkedAt: "2026-10-24T12:00:00.000Z",
    } as const;
    await replyProvider(
      await providerRequest("core.providers.verify"),
      verification,
    );
    await expect(args.onChanged).toHaveBeenCalledWith({
      providerId: "openai",
      verification,
    });
    await expect(args.onClose).toHaveBeenCalled();
    await expect(
      requests(MockWebSocket.instances.at(-1)!, "command").map(
        (request) => request.command,
      ),
    ).toEqual(["core.providers.getConfiguration", "core.providers.verify"]);
  },
};
export const UnsupportedVerificationAndManualEntries: Story = {
  args: {
    provider: {
      ...openAIProvider,
      id: "custom",
      name: "Custom",
      origin: "user",
    },
    onRemoveModel: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const configuration = {
      ...emptyConfiguration,
      providerId: "custom",
      verificationSupported: false,
      customProvider: {
        name: "Custom",
        baseURL: "https://example.com/v1",
        credentialType: "api" as const,
      },
      customModels: [{ id: "org/manual" }],
    };
    await loadProviderForm(configuration);
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove custom model org/manual" }),
    );
    await expect(args.onRemoveModel).toHaveBeenCalledWith("org/manual");
    await userEvent.type(canvas.getByLabelText("API key"), "secret");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await replyProvider(await providerRequest("core.providers.configure"), {
      ...configuration,
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "global",
      origin: "catalog",
    });
    await expect(args.onClose).toHaveBeenCalled();
    await expect(
      requests(MockWebSocket.instances.at(-1)!, "command").map(
        (request) => request.command,
      ),
    ).toEqual(["core.providers.getConfiguration", "core.providers.configure"]);
  },
};
export const RemoveGlobalKeyKeepsEnvironment: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await loadProviderForm({
      ...emptyConfiguration,
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "environment",
    });
    await expect(canvas.getByText(/takes precedence/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove saved key" }),
    );
    await expect(canvas.getByText(/Environment and strategy/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Remove key" }));
    await replyProvider(
      await providerRequest("core.providers.removeCredential"),
      {
        ...emptyConfiguration,
        authStatus: "configured",
        hasSavedCredential: false,
        credentialSource: "environment",
      },
    );
    await expect(args.onChanged).toHaveBeenCalledWith({ providerId: "openai" });
    await expect(args.onClose).toHaveBeenCalled();
  },
};
export const SubscriptionSignIn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalOpen = window.open;
    window.open = fn(() => null);
    try {
      await loadProviderForm();
      await userEvent.click(
        canvas.getByRole("button", { name: "ChatGPT subscription" }),
      );
      await expect(canvas.queryByLabelText("API key")).not.toBeInTheDocument();
      await userEvent.click(
        canvas.getByRole("button", { name: "Continue with ChatGPT" }),
      );
      const start = await providerRequest("core.providers.beginSignIn");
      await expect(start.arguments).toEqual({ providerId: "openai" });
      const attemptId = "f3fbfb24-dbc9-43d4-b29d-8d81242f0c14";
      await replyProvider(start, {
        attemptId,
        authorizationURL:
          "https://auth.openai.com/api/accounts/authorize?state=test",
      });
      await expect(
        canvas.getByRole("link", { name: "Open sign-in page" }),
      ).toHaveAttribute("target", "_blank");
      const status = await providerRequest("core.providers.getSignInStatus");
      await replyProvider(status, { attemptId, status: "connected" });
      await expect(args.onChanged).toHaveBeenCalledWith({
        providerId: "openai",
      });
      await expect(args.onClose).toHaveBeenCalled();
      await expect(
        requests(MockWebSocket.instances.at(-1)!).filter(
          (request) =>
            request.command === "core.providers.configure" ||
            request.command === "core.providers.verify",
        ),
      ).toHaveLength(0);
    } finally {
      window.open = originalOpen;
    }
  },
};
export const SubscriptionFailure: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalOpen = window.open;
    window.open = fn(() => null);
    try {
      await loadProviderForm();
      await userEvent.click(
        canvas.getByRole("button", { name: "ChatGPT subscription" }),
      );
      await userEvent.click(
        canvas.getByRole("button", { name: "Continue with ChatGPT" }),
      );
      const start = await providerRequest("core.providers.beginSignIn");
      const attemptId = "f3fbfb24-dbc9-43d4-b29d-8d81242f0c14";
      await replyProvider(start, {
        attemptId,
        authorizationURL:
          "https://auth.openai.com/api/accounts/authorize?state=test",
      });
      const status = await providerRequest("core.providers.getSignInStatus");
      await replyProvider(status, {
        attemptId,
        status: "error",
        message: "ChatGPT sign-in was declined.",
      });
      await expect(canvas.getByRole("alert")).toHaveTextContent(
        "ChatGPT sign-in was declined.",
      );
      await expect(
        canvas.getByRole("button", { name: "Continue with ChatGPT" }),
      ).toBeEnabled();
      await expect(args.onClose).not.toHaveBeenCalled();
    } finally {
      window.open = originalOpen;
    }
  },
};

export const RequiredKeyValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await loadProviderForm();
    const input = canvas.getByLabelText("API key");
    await userEvent.type(input, "   ");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Enter an API key.",
    );
    await expect(input).toHaveFocus();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(
      requests(MockWebSocket.instances.at(-1)!).filter(
        (request) => request.command === "core.providers.configure",
      ),
    ).toHaveLength(0);
    await userEvent.type(input, "new-key");
    await expect(input).toHaveAttribute("aria-invalid", "false");
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const CopilotDeviceSignIn: Story = {
  args: {
    provider: {
      ...openAIProvider,
      id: "github-copilot",
      name: "GitHub Copilot",
      credentialType: "oauth",
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const originalOpen = window.open;
    window.open = fn(() => null);
    try {
      await loadProviderForm({
        ...emptyConfiguration,
        providerId: "github-copilot",
        verificationSupported: false,
      });
      await userEvent.click(
        canvas.getByRole("button", { name: "Continue with GitHub Copilot" }),
      );
      const start = await providerRequest("core.providers.beginSignIn");
      await expect(start.arguments).toEqual({ providerId: "github-copilot" });
      const attemptId = "f3fbfb24-dbc9-43d4-b29d-8d81242f0c14";
      await replyProvider(start, {
        attemptId,
        authorizationURL: "https://github.com/login/device",
        userCode: "ABCD-EFGH",
      });
      await expect(canvas.getByText("ABCD-EFGH")).toBeVisible();
      await expect(
        canvas.getByRole("link", { name: "Open sign-in page" }),
      ).toHaveAttribute("href", "https://github.com/login/device");
      await replyProvider(
        await providerRequest("core.providers.getSignInStatus"),
        { attemptId, status: "connected" },
      );
      await expect(args.onChanged).toHaveBeenCalledWith({
        providerId: "github-copilot",
      });
      await expect(args.onClose).toHaveBeenCalled();
    } finally {
      window.open = originalOpen;
    }
  },
};
