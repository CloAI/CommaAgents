import type { Meta, StoryObj } from "@storybook/react-vite";
import { act, useState } from "react";
import {
  expect,
  fireEvent,
  fn,
  spyOn,
  userEvent,
  within,
} from "storybook/test";
import { Button } from "../../design-system/Button";
import { SettingsProvider, useSettings } from "../../hooks/useSettings";
import { ThemeProvider } from "../../hooks/useTheme";
import { CommaAgentsDaemonProvider } from "../../hooks/useCommaAgentsDaemon";
import { exampleProviders } from "./ProvidersSettings/test.utils";
import { publishProviders } from "./ProvidersSettings/ProviderConfigurationDialog/test.utils";
import { MockWebSocket } from "../../hooks/useWebSocket/test.utils";
import { loadSettings } from "../../settings";
import { SettingsDialog } from "./SettingsDialog";
import type { SettingsDialogProps } from "./SettingsDialog";

function SettingsLauncher({ onClose }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const { settings } = useSettings();
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open settings</Button>
      <p>
        Active endpoint:{" "}
        <output aria-label="Active daemon URL">{settings.daemon.url}</output>
      </p>
      {open && (
        <SettingsDialog
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

const meta = {
  title: "Components/SettingsDialog",
  component: SettingsDialog,
  args: { onClose: fn() },
  render: (args) => (
    <SettingsProvider>
      <ThemeProvider>
        <CommaAgentsDaemonProvider>
          <SettingsLauncher {...args} />
        </CommaAgentsDaemonProvider>
      </ThemeProvider>
    </SettingsProvider>
  ),
  beforeEach: () => {
    const originalWebSocket = globalThis.WebSocket;
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const previous = localStorage.getItem("comma-agents.settings");
    localStorage.removeItem("comma-agents.settings");
    return () => {
      globalThis.WebSocket = originalWebSocket;
      if (previous === null) {
        localStorage.removeItem("comma-agents.settings");
      } else {
        localStorage.setItem("comma-agents.settings", previous);
      }
    };
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Edit browser-local preferences with an explicit Save. Switching sections keeps the draft. Cancel, X, and Escape discard unsaved edits; backdrop clicks do not dismiss.",
      },
    },
  },
} satisfies Meta<typeof SettingsDialog>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Sections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    await expect(
      canvas.getByRole("dialog", { name: "Settings / General Settings" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Daemon WebSocket URL" }),
    ).toHaveValue("ws://127.0.0.1:7422/ws");
    for (const label of ["Hub", "Privacy"]) {
      await userEvent.click(canvas.getByRole("button", { name: label }));
      await expect(
        canvas.getByRole("heading", { name: `Settings / ${label}` }),
      ).toBeVisible();
      await expect(
        canvas.queryByRole("heading", { name: label }),
      ).not.toBeInTheDocument();
      await expect(
        canvas.getByText("No settings are available in this section yet."),
      ).toBeVisible();
    }
    await userEvent.click(canvas.getByRole("button", { name: "Providers" }));
    await expect(
      canvas.getByRole("dialog", { name: "Settings / Providers" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("searchbox", { name: "Search providers and models" }),
    ).toBeVisible();
    await expect(canvas.getByText("Loading providers...")).toBeVisible();
    await userEvent.type(canvas.getByRole("searchbox"), "model{Enter}");
    await expect(localStorage.getItem("comma-agents.settings")).toBeNull();
  },
};

export const SavePersists: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    const input = canvas.getByRole("textbox", { name: "Daemon WebSocket URL" });
    await userEvent.clear(input);
    await userEvent.type(input, "  wss://daemon.example/proxy?mode=local  ");
    await userEvent.click(canvas.getByRole("button", { name: "Appearance" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "General Settings" }),
    );
    const restoredInput = canvas.getByRole("textbox", {
      name: "Daemon WebSocket URL",
    });
    await expect(restoredInput).toHaveValue(
      "  wss://daemon.example/proxy?mode=local  ",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByText("Saved", { exact: true })).toBeVisible();
    await expect(restoredInput).toHaveValue(
      "wss://daemon.example/proxy?mode=local",
    );
    await expect(canvas.getByRole("dialog")).toBeVisible();
    await expect(
      JSON.parse(localStorage.getItem("comma-agents.settings") ?? "null"),
    ).toEqual({
      version: 1,
      daemon: { url: "wss://daemon.example/proxy?mode=local" },
    });
    await expect(loadSettings().settings.daemon.url).toBe(
      "wss://daemon.example/proxy?mode=local",
    );
  },
};

export const CancelDiscardsDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open settings" });
    await userEvent.click(trigger);
    const input = canvas.getByRole("textbox", { name: "Daemon WebSocket URL" });
    await userEvent.clear(input);
    await userEvent.type(input, "ws://unsaved.example/ws");
    await userEvent.click(canvas.getByRole("button", { name: "Privacy" }));
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
    await expect(localStorage.getItem("comma-agents.settings")).toBeNull();
    await userEvent.click(trigger);
    await expect(
      canvas.getByRole("textbox", { name: "Daemon WebSocket URL" }),
    ).toHaveValue("ws://127.0.0.1:7422/ws");
  },
};

export const InvalidEndpoints: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    const input = canvas.getByRole("textbox", { name: "Daemon WebSocket URL" });
    for (const value of [
      "",
      "https://daemon.example/ws",
      "ws:daemon.example/ws",
      "invalid",
      "ws://user:secret@daemon.example/ws",
      "ws://daemon.example/ws#section",
    ]) {
      await userEvent.clear(input);
      if (value) {
        await userEvent.type(input, value);
      }
      await userEvent.click(canvas.getByRole("button", { name: "Save" }));
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(input).toHaveFocus();
      await expect(canvas.getByRole("alert")).toBeVisible();
      await expect(localStorage.getItem("comma-agents.settings")).toBeNull();
    }
  },
};

export const WriteFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    const input = canvas.getByRole("textbox", { name: "Daemon WebSocket URL" });
    await userEvent.clear(input);
    await userEvent.type(input, "ws://next.example/ws");
    const write = spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Save" }));
      await expect(canvas.getByRole("alert")).toHaveTextContent(
        "could not be saved",
      );
      await expect(input).toHaveValue("ws://next.example/ws");
      await expect(
        canvas.getByLabelText("Active daemon URL"),
      ).toHaveTextContent("ws://127.0.0.1:7422/ws");
    } finally {
      write.mockRestore();
    }
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByLabelText("Active daemon URL")).toHaveTextContent(
      "ws://next.example/ws",
    );
    await expect(canvas.getByText("Saved", { exact: true })).toBeVisible();
  },
};

export const MalformedStorage: Story = {
  beforeEach: () => {
    localStorage.setItem("comma-agents.settings", "{broken");
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    await expect(canvas.getByText(/could not be read/)).toBeVisible();
    await expect(localStorage.getItem("comma-agents.settings")).toBe("{broken");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      canvas.queryByText(/could not be read/),
    ).not.toBeInTheDocument();
    await expect(
      JSON.parse(localStorage.getItem("comma-agents.settings") ?? "null"),
    ).toEqual({ version: 1, daemon: { url: "ws://127.0.0.1:7422/ws" } });
  },
};

export const UnsupportedVersion: Story = {
  beforeEach: () => {
    localStorage.setItem(
      "comma-agents.settings",
      '{"version":99,"daemon":{"url":"ws://future.example/ws"}}',
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    await expect(canvas.getByText(/unsupported version/)).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Daemon WebSocket URL" }),
    ).toHaveValue("ws://127.0.0.1:7422/ws");
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(
      JSON.parse(localStorage.getItem("comma-agents.settings") ?? "null")
        .version,
    ).toBe(99);
  },
};

export const ReadFailure: Story = {
  beforeEach: () => {
    const read = spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    return () => read.mockRestore();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    await expect(canvas.getByText(/could not be read/)).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Daemon WebSocket URL" }),
    ).toHaveValue("ws://127.0.0.1:7422/ws");
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const ProviderWorkflows: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Providers" }));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await publishProviders(exampleProviders);
    const search = canvas.getByRole("searchbox");
    await userEvent.type(search, "retained filter");
    const addModel = canvas.getByRole("button", { name: "+ Model" });
    await userEvent.click(addModel);
    const modelDialog = canvas.getByRole("dialog", { name: "Add Model" });
    await expect(
      within(modelDialog).getByRole("textbox", { name: "Model ID" }),
    ).toBeVisible();
    await userEvent.click(
      within(modelDialog).getByRole("button", { name: "Close dialog" }),
    );
    await expect(
      canvas.getByRole("dialog", { name: "Settings / Providers" }),
    ).toBeVisible();
    await expect(addModel).toHaveFocus();
    await expect(search).toHaveValue("retained filter");
    const addProvider = canvas.getByRole("button", { name: "+ Provider" });
    await userEvent.click(addProvider);
    const providerDialog = canvas.getByRole("dialog", {
      name: "Add Custom Provider",
    });
    await expect(
      within(providerDialog).getByLabelText("Provider ID"),
    ).toBeVisible();
    fireEvent(providerDialog, new Event("cancel", { cancelable: true }));
    await expect(
      canvas.getByRole("dialog", { name: "Settings / Providers" }),
    ).toBeVisible();
    await expect(addProvider).toHaveFocus();
    await expect(search).toHaveValue("retained filter");
    await expect(document.body.style.overflow).toBe("hidden");
    await expect(localStorage.getItem("comma-agents.settings")).toBeNull();
  },
};

export const LocalizedSections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    const input = canvas.getByRole("textbox", { name: "Daemon WebSocket URL" });
    await userEvent.clear(input);
    await userEvent.type(input, "https://invalid.example");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByRole("alert")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Providers" }));
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "+ Model" })).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "General Settings" }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Daemon WebSocket URL" }),
    ).toHaveValue("https://invalid.example");
    await expect(canvas.getByRole("alert")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "+ Model" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "+ Provider" }),
    ).not.toBeInTheDocument();
    await expect(localStorage.getItem("comma-agents.settings")).toBeNull();
  },
};

export const ThemeChoicePersists: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Open settings" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Appearance" }));
    await userEvent.click(canvas.getByRole("button", { name: "Light" }));
    await expect(document.documentElement.style.colorScheme).toBe("light");
    await expect(
      document.documentElement.style.getPropertyValue("--color-canvas"),
    ).toBe("#fdf9ff");
    await userEvent.click(
      canvas.getByRole("button", { name: "Customize copy" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save theme" }));
    await expect(loadSettings().settings.appearance?.mode).toBe("light");
    await expect(
      loadSettings().settings.appearance?.customThemes[0]?.name,
    ).toBe("Comma copy");
  },
};
