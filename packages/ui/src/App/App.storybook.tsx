import { act, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { HostProvider } from "../hooks/useHost";
import type { HostWorkspace, WorkspaceSnapshot } from "../hooks/useHost";
import { layoutReducer } from "../workspace";
import { daemonLogs } from "../hooks/useLogBucket/logger";
import { CommaAgentsDaemonProvider } from "../hooks/useCommaAgentsDaemon";
import { LayoutProvider } from "../hooks/useLayout";
import { isolateLayoutStorage } from "../hooks/useLayout/test.utils";
import { SettingsProvider } from "../hooks/useSettings";
import { ThemeProvider } from "../hooks/useTheme";
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
      <ThemeProvider>
        <CommaAgentsDaemonProvider>
          <LayoutProvider>
            <Story />
          </LayoutProvider>
        </CommaAgentsDaemonProvider>
      </ThemeProvider>
    </SettingsProvider>
  ),
];

export const Desktop: Story = { decorators: withProviders };
export const DetachedWindow: Story = {
  decorators: withProviders,
  args: { showSidebar: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("navigation", { name: "Application" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("group", { name: "New chat" })).toBeVisible();
  },
};

const detachedSnapshot: WorkspaceSnapshot = {
  detached: true,
  selectingDock: false,
  state: {
    layout: {
      root: { type: "pane", id: "detached-preview", path: "/" },
      activeId: "detached-preview",
    },
    strategyChoices: {},
  },
};
const detachedHost: HostWorkspace = {
  getSnapshot: () => detachedSnapshot,
  subscribe: () => () => {},
  send: fn(),
  ready: fn(),
};

function DetachedAppPreview() {
  const [generation, setGeneration] = useState(0);
  return (
    <HostProvider host={{ workspace: detachedHost }}>
      <button onClick={() => setGeneration((value) => value + 1)}>
        Remount chat
      </button>
      <App key={generation} />
    </HostProvider>
  );
}

export const DetachedChatKeepsDraftAndWidth: Story = {
  render: () => <DetachedAppPreview />,
  beforeEach: () => {
    localStorage.removeItem("comma-agents.draft.detached-preview");
    localStorage.removeItem("comma-agents.centered.detached-preview");
    return () => {
      localStorage.removeItem("comma-agents.draft.detached-preview");
      localStorage.removeItem("comma-agents.centered.detached-preview");
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("navigation", { name: "Application" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Split vertical" }),
    ).toBeEnabled();
    await userEvent.type(
      canvas.getByRole("textbox", { name: /^Message$/ }),
      "Keep this unsent draft",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Center chat" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remount chat" }));
    await expect(
      canvas.getByRole("textbox", { name: /^Message$/ }),
    ).toHaveValue("Keep this unsent draft");
    await expect(
      canvas.getByRole("button", { name: "Use full chat width" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.queryByRole("button", { name: "Move to new window" }),
    ).not.toBeInTheDocument();
  },
};

function DetachedSplitsPreview() {
  const [workspace] = useState<HostWorkspace>(() => {
    let snapshot: WorkspaceSnapshot = {
      ...detachedSnapshot,
      state: {
        layout: {
          root: { type: "pane", id: "detached-splits", path: "/" },
          activeId: "detached-splits",
        },
        strategyChoices: {},
      },
    };
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      ready: () => {},
      send: (command) => {
        if (command.type === "layout") {
          snapshot = {
            ...snapshot,
            state: layoutReducer(snapshot.state, command.action),
          };
          for (const listener of listeners) {
            listener();
          }
        }
      },
    };
  });
  return (
    <HostProvider host={{ workspace }}>
      <App />
    </HostProvider>
  );
}

export const DetachedWindowSupportsSplits: Story = {
  render: () => <DetachedSplitsPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("navigation", { name: "Application" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Move to new window" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Split vertical" }),
    );
    await expect(
      canvas.getAllByRole("group", { name: "New chat" }),
    ).toHaveLength(2);
    await expect(
      canvas.getAllByRole("button", { name: "Move to new window" }),
    ).toHaveLength(2);
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Split horizontal" })[0]!,
    );
    await expect(
      canvas.getAllByRole("group", { name: "New chat" }),
    ).toHaveLength(3);
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Close pane" })[0]!,
    );
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Close pane" })[0]!,
    );
    await expect(
      canvas.getAllByRole("group", { name: "New chat" }),
    ).toHaveLength(1);
    await expect(
      canvas.queryByRole("button", { name: "Move to new window" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("navigation", { name: "Application" }),
    ).not.toBeInTheDocument();
  },
};
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
      canvas.getByRole("dialog", { name: /^Settings\b/ }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Daemon Settings" }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "WebSocket URL" }),
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
