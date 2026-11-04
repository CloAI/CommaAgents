import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { daemonLogs } from "../hooks/useLogBucket/logger";
import { CommaAgentsDaemonProvider } from "../hooks/useCommaAgentsDaemon";
import { LayoutProvider } from "../hooks/useLayout";
import { isolateLayoutStorage } from "../hooks/useLayout/test.utils";
import { SettingsProvider } from "../hooks/useSettings";
import { MockWebSocket } from "../hooks/useWebSocket/test.utils";
import { ConnectionStatus } from "../design-system/ConnectionStatus";
import { App, AppRender } from "./App";

const meta = {
  title: "Screens/App",
  component: AppRender,
  args: {
    connectionStatus: <ConnectionStatus label="Daemon" status="connected" />,
  },
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    daemonLogs.clear();
    MockWebSocket.instances = [];
    const original = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const restoreLayout = isolateLayoutStorage();
    return () => {
      globalThis.WebSocket = original;
      restoreLayout();
    };
  },
} satisfies Meta<typeof AppRender>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

// The workspace reads settings, the daemon, and the saved layout, so shell previews supply them.
const withProviders: NonNullable<Story["decorators"]> = [
  (Story) => (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <LayoutProvider>
          <Story />
        </LayoutProvider>
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  ),
];

export const Desktop: Story = { decorators: withProviders };
export const Mobile: Story = {
  decorators: withProviders,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Settings: Story = {
  render: () => <App />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Settings" });
    await userEvent.click(trigger);
    await expect(
      canvas.getByRole("dialog", { name: "Settings" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Daemon WebSocket URL" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Close dialog" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};

export const ConnectionLifecycle: Story = {
  render: () => <App />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Daemon: Not connected" }),
    ).toHaveAttribute("data-status", "disconnected");
    const socket = MockWebSocket.instances.at(-1)!;
    const count = MockWebSocket.instances.length;
    const environment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    try {
      await act(() => socket.open());
      await expect(
        canvas.getByRole("button", { name: "Daemon: Connected" }),
      ).toHaveAttribute("data-status", "connected");
      await act(() => socket.fail());
      await expect(
        canvas.getByRole("button", { name: "Daemon: Not connected" }),
      ).toHaveAttribute("data-status", "disconnected");
    } finally {
      environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
    await expect(MockWebSocket.instances).toHaveLength(count);
    const trigger = canvas.getByRole("button", {
      name: "Daemon: Not connected",
    });
    await userEvent.click(trigger);
    await expect(
      canvas.getByRole("dialog", { name: "Daemon logs" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Log entries")).toHaveTextContent(
      "WebSocket connection failed.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Close dialog" }));
    await expect(trigger).toHaveFocus();
    await expect(MockWebSocket.instances).toHaveLength(count);
  },
};

export const NewChatReplacesFocusedPane: Story = {
  render: () => <App />,
  beforeEach: () => {
    const previousUrl = window.location.href;
    const restore = isolateLayoutStorage({
      root: {
        type: "split",
        id: "split",
        direction: "row",
        sizes: [40, 60],
        children: [
          { type: "pane", id: "a", path: "/runs/aaaaaaaa" },
          { type: "pane", id: "b", path: "/runs/bbbbbbbb" },
        ],
      },
      activeId: "b",
    });
    window.history.replaceState(null, "", "#/runs/bbbbbbbb");
    return () => {
      restore();
      window.history.replaceState(null, "", previousUrl);
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sibling = canvas.getByRole("group", { name: "Run bbbbbbbb" });
    await userEvent.click(
      canvas.getByRole("heading", { name: "Run aaaaaaaa" }),
    );
    const trigger = within(
      canvas.getByRole("navigation", { name: "Application" }),
    ).getByRole("button", { name: "New chat" });
    await userEvent.click(trigger);
    await expect(
      canvas.queryByRole("group", { name: "Run aaaaaaaa" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("group", { name: "Run bbbbbbbb" })).toBe(
      sibling,
    );
    const fresh = canvas.getByRole("group", { name: "New chat" });
    await expect(fresh).toHaveAttribute("data-active", "true");
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    const input = within(fresh).getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Discard this draft");
    await userEvent.click(trigger);
    const emptyInput = within(
      canvas.getByRole("group", { name: "New chat" }),
    ).getByRole("textbox", { name: "Message" });
    await expect(emptyInput).toHaveValue("");
    await expect(emptyInput).not.toBe(input);
    await expect(canvas.getByRole("group", { name: "Run bbbbbbbb" })).toBe(
      sibling,
    );
  },
};

export const NewChatReplacesSinglePane: Story = {
  render: () => <App />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Old draft");
    await userEvent.click(canvas.getByRole("button", { name: "New chat" }));
    await expect(canvas.getByRole("textbox", { name: "Message" })).toHaveValue(
      "",
    );
    await expect(canvas.getByRole("textbox", { name: "Message" })).not.toBe(
      input,
    );
  },
};
