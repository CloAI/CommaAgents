import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type {
  DesktopSettings as DesktopSettingsValues,
  HostDesktopSettings,
} from "../../../../hooks/useHost";
import { DesktopSettings } from "./DesktopSettings";

/**
 * Stand in for a desktop host that keeps the values in memory.
 * @param {DesktopSettingsValues} initial - Values the host starts with.
 * @returns {HostDesktopSettings} Host that applies each change.
 */
function memoryHost(initial: DesktopSettingsValues): HostDesktopSettings {
  let current = initial;
  return {
    get: async () => current,
    set: async (patch) => {
      current = { ...current, ...patch };
      return current;
    },
  };
}

const meta = {
  title: "Settings/Desktop settings",
  component: DesktopSettings,
  parameters: {
    docs: {
      description: {
        component:
          "Desktop-only behavior shown in General settings. Each switch applies at once.",
      },
    },
  },
} satisfies Meta<typeof DesktopSettings>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    settings: memoryHost({
      keepRunningInBackground: true,
      startOnLogin: false,
      startOnLoginAvailable: true,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const background = await canvas.findByRole("switch", {
      name: "Keep running in background",
    });
    await expect(background).toHaveAttribute("aria-checked", "true");
    await userEvent.click(background);
    await expect(background).toHaveAttribute("aria-checked", "false");
    await userEvent.click(
      await canvas.findByRole("switch", { name: "Start on login" }),
    );
    await expect(
      canvas.getByRole("switch", { name: "Start on login" }),
    ).toHaveAttribute("aria-checked", "true");
  },
};

export const LoginUnavailable: Story = {
  args: {
    settings: memoryHost({
      keepRunningInBackground: false,
      startOnLogin: false,
      startOnLoginAvailable: false,
    }),
  },
  play: async ({ canvasElement }) => {
    const login = await within(canvasElement).findByRole("switch", {
      name: "Start on login",
    });
    await expect(login).toBeDisabled();
    await expect(
      within(canvasElement).getByText(/Not available on Linux/),
    ).toBeVisible();
  },
};

export const SaveFails: Story = {
  args: {
    settings: {
      get: async () => ({
        keepRunningInBackground: false,
        startOnLogin: false,
        startOnLoginAvailable: true,
      }),
      set: async () => {
        throw new Error("Could not update the login item.");
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("switch", { name: "Keep running in background" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not update the login item.",
    );
  },
};
