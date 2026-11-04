import type { Meta, StoryObj } from "@storybook/react-vite";
import { act } from "react";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { AddModelDialog } from "./AddModelDialog";
import { exampleProviders } from "../test.utils";
import { SettingsProvider } from "../../../../hooks/useSettings";
import { CommaAgentsDaemonProvider } from "../../../../hooks/useCommaAgentsDaemon";
import { MockWebSocket } from "../../../../hooks/useWebSocket/test.utils";
import {
  deliver,
  requests,
} from "../../../../hooks/useCommaAgentsDaemon/test.utils";

/** Open the shared fixture socket without contacting a daemon.
 * @returns {Promise<MockWebSocket>} Connected fixture.
 */
async function openSocket() {
  const socket = MockWebSocket.instances.at(-1)!;
  await act(async () => socket.open());
  return socket;
}

/** Reply to a configuration read before the explicit addition command.
 * @param {MockWebSocket} socket - Connected fixture.
 * @param {readonly {id:string}[]} customModels - Existing manual entries.
 * @returns {Promise<void>} Resolves after routing the read result.
 */
async function configuration(
  socket: MockWebSocket,
  customModels: readonly { id: string }[] = [],
) {
  await waitFor(() => expect(requests(socket)).toHaveLength(1));
  const request = requests(socket)[0]!;
  await act(async () =>
    deliver(socket, request.requestId, {
      type: "response",
      ok: true,
      data: {
        providerId: request.arguments?.providerId,
        authStatus: "configured",
        hasSavedCredential: true,
        credentialSource: "global",
        verificationSupported: false,
        customProvider: null,
        customModels,
      },
    }),
  );
}

/** Reply to the saved model command.
 * @param {MockWebSocket} socket - Connected fixture.
 * @returns {Promise<void>} Resolves after successful persistence response.
 */
async function saved(socket: MockWebSocket) {
  await waitFor(() => expect(requests(socket)).toHaveLength(2));
  await act(async () =>
    deliver(socket, requests(socket)[1]!.requestId, {
      type: "response",
      ok: true,
      data: exampleProviders[0],
    }),
  );
}

const meta = {
  title: "Components/SettingsDialog/ProvidersSettings/AddModelDialog",
  component: AddModelDialog,
  args: {
    providers: exampleProviders,
    initialProviderId: "alpha",
    onClose: fn(),
  },
  beforeEach: () => {
    const previous = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    MockWebSocket.instances = [];
    localStorage.clear();
    return () => {
      globalThis.WebSocket = previous;
    };
  },
  decorators: [
    (Story) => (
      <SettingsProvider>
        <CommaAgentsDaemonProvider>
          <div
            style={{
              maxWidth: "32rem",
              maxHeight: "36rem",
              overflow: "auto",
              background: "var(--color-surface)",
            }}
          >
            <Story />
          </div>
        </CommaAgentsDaemonProvider>
      </SettingsProvider>
    ),
  ],
} satisfies Meta<typeof AddModelDialog>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Metadata: Story = {
  play: async ({ canvasElement, args }) => {
    const socket = await openSocket();
    const canvas = within(canvasElement);
    await expect(requests(socket)).toHaveLength(0);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Model ID" }),
      "org/new-model",
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Display name" }),
      "My model",
    );
    await expect(
      canvas.queryByRole("textbox", { name: "Family" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Tools" }));
    const vision = canvas.getByRole("button", { name: "Vision" });
    await userEvent.click(vision);
    await userEvent.click(vision);
    await expect(vision).toHaveAttribute("aria-pressed", "false");
    await userEvent.type(
      canvas.getByRole("spinbutton", { name: "Context window" }),
      "32768",
    );
    await userEvent.click(canvas.getByText("Advanced metadata"));
    await userEvent.type(
      canvas.getByRole("spinbutton", { name: "Input" }),
      "0",
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Knowledge cutoff" }),
      "2025-02",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await configuration(socket);
    await waitFor(() => expect(requests(socket)).toHaveLength(2));
    await expect(requests(socket)[1]).toMatchObject({
      command: "core.providers.addCustomProviderModel",
      arguments: {
        providerId: "alpha",
        modelId: "org/new-model",
        metadata: {
          name: "My model",
          capabilities: { tools: true },
          contextWindow: 32768,
          cost: { input: 0 },
          knowledgeCutoff: "2025-02",
        },
      },
    });
    await expect(requests(socket)[1]?.arguments?.metadata).not.toHaveProperty(
      "capabilities.reasoning",
    );
    await expect(requests(socket)[1]?.arguments?.metadata).not.toHaveProperty(
      "capabilities.vision",
    );
    await saved(socket);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const Validation: Story = {
  play: async ({ canvasElement }) => {
    const socket = await openSocket();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Model ID is required",
    );
    await expect(
      canvas.getByRole("textbox", { name: "Model ID" }),
    ).toHaveFocus();
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Model ID" }),
      "new-model",
    );
    await userEvent.click(canvas.getByText("Advanced metadata"));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Knowledge cutoff" }),
      "2025-02-31",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "must be a valid",
    );
    await expect(
      canvas.getByRole("textbox", { name: "Knowledge cutoff" }),
    ).toHaveFocus();
    await expect(
      canvas.getByRole("textbox", { name: "Knowledge cutoff" }),
    ).toHaveAttribute("aria-invalid", "true");
    await expect(requests(socket)).toHaveLength(0);
  },
};

export const SearchProvider: Story = {
  args: { initialProviderId: undefined },
  play: async ({ canvasElement }) => {
    const socket = await openSocket();
    const canvas = within(canvasElement);
    const picker = canvas.getByRole("combobox", { name: "Provider" });
    await userEvent.click(picker);
    await userEvent.type(picker, "beta");
    await expect(
      within(canvas.getByRole("listbox", { name: "Providers" })).getAllByRole(
        "option",
      ),
    ).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    await expect(picker).toHaveValue("Beta");
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Model ID" }),
      "new",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await configuration(socket);
    await waitFor(() => expect(requests(socket)).toHaveLength(2));
    await expect(requests(socket)[1]).toMatchObject({
      arguments: { providerId: "beta", modelId: "new" },
    });
    await saved(socket);
  },
};

export const ExistingManualEntry: Story = {
  play: async ({ canvasElement }) => {
    const socket = await openSocket();
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Model ID" }),
      "manual",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await configuration(socket, [{ id: "manual" }]);
    await expect(canvas.getByRole("alert")).toHaveTextContent("already exists");
    await expect(requests(socket)).toHaveLength(1);
  },
};

export const ServerError: Story = {
  play: async ({ canvasElement }) => {
    const socket = await openSocket();
    const canvas = within(canvasElement);
    fireEvent.change(canvas.getByRole("textbox", { name: "Model ID" }), {
      target: { value: "model" },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await configuration(socket);
    await waitFor(() => expect(requests(socket)).toHaveLength(2));
    await act(async () =>
      deliver(socket, requests(socket)[1]!.requestId, {
        type: "response",
        ok: false,
        error: {
          code: "PROVIDER_STORAGE_ERROR",
          message: "Provider settings could not be saved.",
        },
      }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "could not be saved",
    );
    await expect(canvas.getByRole("textbox", { name: "Model ID" })).toHaveValue(
      "model",
    );
  },
};

export const SelectedProviderPrefix: Story = {
  play: async ({ canvasElement }) => {
    const socket = await openSocket();
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Model ID" }),
      "alpha/my-model",
    );
    await expect(canvas.getByRole("textbox", { name: "Model ID" })).toHaveValue(
      "my-model",
    );
    await expect(canvas.getByText("alpha/", { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await configuration(socket);
    await waitFor(() => expect(requests(socket)).toHaveLength(2));
    await expect(requests(socket)[1]!.arguments).toEqual({
      providerId: "alpha",
      modelId: "my-model",
    });
    await saved(socket);
  },
};
