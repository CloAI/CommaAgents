import type { Meta, StoryObj } from "@storybook/react-vite";
import { act } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import {
  ProvidersSettings,
  ProvidersSettingsRender,
} from "./ProvidersSettings";
import { exampleProviders } from "./test.utils";
import { SettingsProvider } from "../../../hooks/useSettings";
import { CommaAgentsDaemonProvider } from "../../../hooks/useCommaAgentsDaemon";
import {
  deliver,
  requests,
} from "../../../hooks/useCommaAgentsDaemon/test.utils";
import { MockWebSocket } from "../../../hooks/useWebSocket/test.utils";
/** Select a provider through the searchable picker.
 * @param {HTMLElement} root - Story canvas.
 * @param {string} name - Provider display name.
 * @returns {Promise<void>} Resolves after selection.
 */
async function chooseProvider(root: HTMLElement, name: string) {
  const canvas = within(root);
  const picker = canvas.getByRole("combobox", { name: "Filter by provider" });
  await userEvent.click(picker);
  if (name !== "All providers") await userEvent.type(picker, name);
  await userEvent.click(canvas.getByRole("option", { name }));
}
/** Expand currently collapsed provider groups.
 * @param {HTMLElement} root - Story canvas.
 * @returns {Promise<void>} Resolves after all groups are expanded.
 */
async function expandProviders(root: HTMLElement) {
  for (const button of within(root).queryAllByRole("button", {
    expanded: false,
  }))
    await userEvent.click(button);
}
const meta = {
  title: "Components/SettingsDialog/ProvidersSettings",
  component: ProvidersSettingsRender,
  args: { providers: exampleProviders, isLoading: false, onClose: fn() },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "28rem", height: "32rem", display: "flex" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProvidersSettingsRender>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
export const PrivacyCapabilities: Story = {
  args: {
    providers: [
      {
        ...exampleProviders[0]!,
        models: [
          {
            id: "private-model",
            sources: ["provider"],
            metadata: {
              name: "Privacy capable",
              capabilities: { teeAttestation: true, e2ee: true },
            },
          },
          {
            id: "unsupported-model",
            sources: ["provider"],
            metadata: {
              name: "Unsupported",
              capabilities: { teeAttestation: false, e2ee: false },
            },
          },
          {
            id: "unknown-model",
            sources: ["provider"],
            metadata: { name: "Unknown" },
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expandProviders(canvasElement);
    await expect(
      canvas.getAllByRole("img", { name: "TEE attestation support" }),
    ).toHaveLength(1);
    await expect(
      canvas.getAllByRole("img", { name: "E2EE support" }),
    ).toHaveLength(1);
    await userEvent.click(
      canvas.getByRole("button", { name: "TEE attestation support" }),
    );
    await expect(canvas.getByText("1 model found")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "E2EE support" }));
    await expect(canvas.getByText("1 model found")).toBeVisible();
    await expandProviders(canvasElement);
    await expect(canvas.getByText("Privacy capable")).toBeVisible();
    await expect(
      canvas.queryByText("Unsupported", { exact: true }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText("Unknown", { exact: true }),
    ).not.toBeInTheDocument();
  },
};
export const CombinedFilters: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);
    await expect(canvas.getByText("4 models found")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Tools" }));
    await expect(canvas.getByText("2 models found")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reasoning" }));
    await expect(canvas.getByText("1 model found")).toBeVisible();
    await chooseProvider(canvasElement, "Alpha");
    await expect(
      canvas.getByText("No models match your filters."),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Tools" }));
    await expandProviders(canvasElement);
    await expect(canvas.getByText("Reasoner", { exact: true })).toBeVisible();
    const search = canvas.getByRole("searchbox");
    await userEvent.type(search, "  LOGIC  ");
    await expect(canvas.getByText("1 model found")).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, "missing");
    await expect(
      canvas.getByText("No models match your filters."),
    ).toBeVisible();
    await userEvent.clear(search);
    await userEvent.click(canvas.getByRole("button", { name: "Reasoning" }));
    await chooseProvider(canvasElement, "All providers");
    await userEvent.type(search, "BETA");
    await expect(canvas.getByText("1 model found")).toBeVisible();
    await userEvent.clear(search);
    await chooseProvider(canvasElement, "Empty");
    await expect(
      canvas.getByRole("button", { name: /Empty.*0 models/ }),
    ).toBeVisible();
  },
};
export const PagingDisabled: Story = {
  args: {
    providers: [
      {
        ...exampleProviders[0]!,
        models: Array.from({ length: 27 }, (_, index) => ({
          id: `model-${index}`,
          sources: ["provider"],
          metadata: { name: `Model ${index}` },
        })),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);
    await expect(canvas.getByText("(27 models)")).toBeVisible();
    await expandProviders(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(27);
    await expect(canvas.queryByRole("navigation")).not.toBeInTheDocument();
    await userEvent.type(canvas.getByRole("searchbox"), "Model 0");
    await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);
    await expandProviders(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
  },
};
export const Loading: Story = { args: { providers: [], isLoading: true } };
export const Error: Story = {
  args: {
    providers: [],
    error: "The daemon did not respond within ten seconds.",
  },
};
export const Empty: Story = { args: { providers: [] } };
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
export const DaemonDiscovery: Story = {
  beforeEach: () => {
    const original = globalThis.WebSocket;
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const environment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previous = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    return () => {
      globalThis.WebSocket = original;
      environment.IS_REACT_ACT_ENVIRONMENT = previous;
    };
  },
  render: () => (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <ProvidersSettings onClose={fn()} />
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Loading providers...")).toBeVisible();
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    const command = requests(socket, "command")[0]!;
    await expect(command.command).toBe("core.providers.list");
    await expect(command.arguments).toEqual({ live: false });
    await act(() =>
      deliver(socket, command.requestId, {
        type: "response",
        ok: true,
        data: { providers: exampleProviders },
      }),
    );
    await expect(canvas.getByText("4 models found")).toBeVisible();
    await userEvent.type(canvas.getByRole("searchbox"), "alpha");
    await userEvent.click(canvas.getByRole("button", { name: "Vision" }));
    await expandProviders(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    await expect(requests(socket, "command")).toHaveLength(1);
  },
};
export const SearchableProvidersAndIcons: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expandProviders(canvasElement);
    await expect(
      within(canvas.getByRole("group", { name: "Models" })).getAllByRole(
        "img",
        { name: "Tools" },
      )[0]!,
    ).toHaveAttribute("title", "Tools");
    const picker = canvas.getByRole("combobox", { name: "Filter by provider" });
    await userEvent.click(picker);
    await userEvent.type(picker, "BeTA");
    await expect(canvas.getAllByRole("option")).toHaveLength(2);
    await expect(
      canvas.getByRole("option", { name: "All providers" }),
    ).toBeVisible();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(
      canvas.getByRole("button", { name: "Remove Beta" }),
    ).toBeVisible();
    await expect(canvas.getByText("1 model found")).toBeVisible();
    await userEvent.click(picker);
    await userEvent.type(picker, "nonexistent");
    await expect(canvas.getByText("No providers match.")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.click(picker);
    await userEvent.type(picker, "temporary");
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide providers" }),
    );
    await expect(picker).toHaveValue("");
    await userEvent.click(picker);
    await userEvent.keyboard("{Enter}");
    await expect(picker).toHaveAttribute("placeholder", "All providers");
    await expect(canvas.getByText("4 models found")).toBeVisible();
  },
};
export const MultipleProviders: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await chooseProvider(canvasElement, "Alpha");
    await expect(canvas.getByText("3 models found")).toBeVisible();
    await chooseProvider(canvasElement, "Beta");
    await expect(canvas.getByText("4 models found")).toBeVisible();
    await expect(
      within(
        canvas.getByRole("group", { name: "Selected providers" }),
      ).getAllByRole("button"),
    ).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Remove Alpha" }));
    await expect(canvas.getByText("1 model found")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Remove Beta" }));
    await expect(canvas.getByText("4 models found")).toBeVisible();
    await chooseProvider(canvasElement, "Alpha");
    await chooseProvider(canvasElement, "Alpha");
    await expect(
      canvas.queryByRole("button", { name: "Remove Alpha" }),
    ).not.toBeInTheDocument();
  },
};
export const CollapsibleProviders: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alpha = canvas.getByRole("button", { name: /Alpha.*3 models/ });
    await expect(alpha).toHaveAttribute("aria-expanded", "false");
    await expect(within(alpha).getByRole("img")).toHaveAttribute(
      "data-status",
      "configured",
    );
    const beta = canvas.getByRole("button", { name: /Beta.*1 model/ });
    await expect(within(beta).getByRole("img")).toHaveAttribute(
      "data-status",
      "configured",
    );
    await userEvent.click(alpha);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await userEvent.keyboard("{Enter}");
    await expect(alpha).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);
    await userEvent.type(canvas.getByRole("searchbox"), "ALPHA");
    await expect(canvas.queryAllByRole("listitem")).toHaveLength(0);
    await expandProviders(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await expect(canvasElement.querySelectorAll("mark").length).toBeGreaterThan(
      0,
    );
  },
};
export const LiteralSearchHighlight: Story = {
  args: {
    providers: [
      {
        ...exampleProviders[0]!,
        authStatus: "none",
        models: [
          {
            id: "a+b[0]",
            sources: ["models.dev"],
            metadata: {
              name: "A+B[0] <script> A+B[0]",
            },
          },
        ],
        origin: "catalog",
        discovery: {
          status: "catalog_only",
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: /Needs credentials/ }),
    ).toHaveAttribute("data-status", "unconfigured");
    const search = canvas.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "a+b[0]" } });
    await expandProviders(canvasElement);
    await expect(canvasElement.querySelectorAll("mark")).toHaveLength(3);
    await expect(canvasElement.querySelector("mark")?.textContent).toBe(
      "A+B[0]",
    );
    fireEvent.change(search, { target: { value: "<script>" } });
    await expandProviders(canvasElement);
    await expect(canvasElement.querySelector("mark")?.textContent).toBe(
      "<script>",
    );
    await expect(canvasElement.querySelector("script")).toBeNull();
    await userEvent.clear(search);
    await expect(canvasElement.querySelectorAll("mark")).toHaveLength(0);
  },
};
export const ProviderDiscoveryIssue: Story = {
  args: {
    providers: [
      {
        ...exampleProviders[0]!,
        origin: "catalog",
        discovery: {
          status: "catalog_only",
          error: "Discovery unavailable.",
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("img", { name: /Discovery issue/ }),
    ).toHaveAttribute("data-status", "warning");
  },
};
export const ProviderActions: Story = {
  args: { onConfigure: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Configure Alpha" }),
    );
    await expect(args.onConfigure).toHaveBeenCalledWith(exampleProviders[0]);
    await expect(
      canvas.getByRole("button", { name: /Alpha.*3 models/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      canvas.getByRole("button", { name: "Configure Beta" }),
    );
    await expect(args.onConfigure).toHaveBeenCalledWith(exampleProviders[1]);
    await expect(
      canvas.getByRole("button", { name: /Beta.*1 model/ }),
    ).toHaveAttribute("aria-expanded", "false");
  },
};
export const VerifiedConnection: Story = {
  args: {
    verification: {
      alpha: {
        providerId: "alpha",
        status: "verified",
        checkedAt: "2026-10-24T00:00:00Z",
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("img", { name: /Alpha: Verified/ }),
    ).toBeVisible();
  },
};
