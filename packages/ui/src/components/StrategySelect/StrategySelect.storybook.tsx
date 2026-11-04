import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { CommaAgentsDaemonProvider } from "../../hooks/useCommaAgentsDaemon";
import { deliver, requests } from "../../hooks/useCommaAgentsDaemon/test.utils";
import type { StrategyItem } from "../../hooks/useStrategies";
import { SettingsProvider } from "../../hooks/useSettings";
import { MockWebSocket } from "../../hooks/useWebSocket/test.utils";
import { SETTINGS_STORAGE_KEY } from "../../settings/settings.constants";
import { StrategySelect, StrategySelectRender } from "./StrategySelect";

const STRATEGIES: readonly StrategyItem[] = [
  {
    name: "Project plan",
    label: "Project plan",
    description: "Plan work using this repository's conventions.",
    version: "1.0.0",
    path: "/work/.comma/strategies/plan.json",
    origin: "cwd",
  },
  {
    name: "Review",
    label: "acme/reviewers > Review",
    description: "Review a change set with a checklist.",
    version: "0.3.0",
    path: "/hub/acme/review.json",
    manifestPath: "/hub/acme/comma-project.json",
    origin: "hub-package",
  },
  {
    name: "Talk",
    label: "@comma/core-strategies > Talk",
    description: "Converse with a single agent.",
    version: "2.0",
    path: "/core/strategies/talk.json",
    manifestPath: "/core/strategies/comma-project.json",
    origin: "bundled",
  },
];

const meta = {
  title: "Components/StrategySelect",
  component: StrategySelectRender,
  args: {
    status: "ready",
    strategies: STRATEGIES,
    selected: STRATEGIES[0],
    onSelect: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Compact picker for the strategy new runs will use. Lists discovered strategies with an origin tag. Disabled with explanatory text while loading, unavailable, or empty.",
      },
    },
  },
} satisfies Meta<typeof StrategySelectRender>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Strategy/ });
    await expect(trigger).toHaveTextContent("Project plan");
    await userEvent.click(trigger);
    await expect(canvas.getByRole("option", { name: /Project/ })).toBeVisible();
    await userEvent.click(canvas.getByRole("option", { name: /Talk/ }));
    await expect(args.onSelect).toHaveBeenCalledWith(
      "/core/strategies/talk.json",
    );
  },
};
export const SearchesAndFiltersByOrigin: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy/ }));
    const search = canvas.getByRole("combobox", { name: "Strategy search" });
    await expect(search).toHaveFocus();
    // Project and Hub are chips; bundled strategies have none but stay listed under All.
    await expect(
      canvas.getAllByRole("radio").map((chip) => chip.textContent),
    ).toEqual(["All", "Project", "Hub"]);
    await expect(canvas.getAllByRole("option")).toHaveLength(3);
    await userEvent.click(canvas.getByRole("radio", { name: "Hub" }));
    await expect(canvas.getAllByRole("option")).toHaveLength(1);
    await userEvent.click(canvas.getByRole("radio", { name: "All" }));
    // The bare name is searchable even though the label is "<project> > <name>".
    await userEvent.type(search, "review");
    await expect(canvas.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    await expect(args.onSelect).toHaveBeenCalledWith("/hub/acme/review.json");
  },
};
export const Loading: Story = {
  args: { status: "loading", strategies: [], selected: undefined },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button");
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveTextContent("Loading strategies...");
  },
};
export const Unavailable: Story = {
  args: { status: "error", strategies: [], selected: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent(
      "Strategies unavailable",
    );
  },
};
export const Empty: Story = {
  args: { status: "empty", strategies: [], selected: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent(
      "No strategies found",
    );
  },
};

/** Run the real hook against a scripted daemon socket. */
const connected = {
  render: () => (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <StrategySelect />
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  ),
  beforeEach: () => {
    const originalWebSocket = globalThis.WebSocket;
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const previous = localStorage.getItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    return () => {
      globalThis.WebSocket = originalWebSocket;
      if (previous === null) {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
      } else {
        localStorage.setItem(SETTINGS_STORAGE_KEY, previous);
      }
    };
  },
} satisfies Story;

// Answer the list request that the mounted hook sent.
async function respond(message: Record<string, unknown>) {
  const socket = MockWebSocket.instances.at(-1)!;
  await act(() => socket.open());
  const list = requests(socket, "command").find(
    (request) => request.command === "core.strategies.list",
  )!;
  await act(() => deliver(socket, list.requestId, message));
}

export const DiscoversAndKeepsThePickForTheSession: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Strategy/ });
    await expect(trigger).toBeDisabled();
    await respond({
      type: "response",
      ok: true,
      data: { strategies: STRATEGIES, warnings: [] },
    });
    // With nothing saved, the highest-priority strategy is used.
    await waitFor(() => expect(trigger).toHaveTextContent("Project plan"));
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole("option", { name: /Talk/ }));
    await expect(trigger).toHaveTextContent("@comma/core-strategies > Talk");
    // A pick lasts for the session and never changes the saved default.
    await expect(
      JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}"),
    ).not.toHaveProperty("strategyPath");
  },
};
export const FallsBackWhenSavedStrategyIsGone: Story = {
  ...connected,
  beforeEach: () => {
    const cleanup = connected.beforeEach();
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        daemon: { url: "ws://127.0.0.1:7422/ws" },
        strategyPath: "/removed.json",
      }),
    );
    return cleanup;
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button");
    await respond({
      type: "response",
      ok: true,
      data: { strategies: STRATEGIES, warnings: [] },
    });
    await waitFor(() => expect(trigger).toHaveTextContent("Project plan"));
  },
};
export const ShowsUnavailableOnDaemonError: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button");
    await respond({
      type: "response",
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Discovery failed" },
    });
    await waitFor(() =>
      expect(trigger).toHaveTextContent("Strategies unavailable"),
    );
    await expect(trigger).toBeDisabled();
  },
};
export const UsesRecordSavedBeforeStrategies: Story = {
  ...connected,
  beforeEach: () => {
    const cleanup = connected.beforeEach();
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, daemon: { url: "ws://127.0.0.1:7422/ws" } }),
    );
    return cleanup;
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button");
    await respond({
      type: "response",
      ok: true,
      data: { strategies: STRATEGIES, warnings: [] },
    });
    await waitFor(() => expect(trigger).toHaveTextContent("Project plan"));
  },
};
