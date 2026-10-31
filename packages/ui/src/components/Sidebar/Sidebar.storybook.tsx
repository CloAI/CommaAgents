import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Sidebar } from "./Sidebar";

const meta = {
  title: "Components/Sidebar",
  component: Sidebar,
  args: { onNewChat: fn(), onSettings: fn() },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Always-visible 44px application rail. New Chat stays at the top and Settings at the bottom. The application opens the settings dialog and keeps New Chat as an alert placeholder.",
      },
    },
  },
} satisfies Meta<typeof Sidebar>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const newChat = canvas.getByRole("button", { name: "New chat" });
    const settings = canvas.getByRole("button", { name: "Settings" });
    await userEvent.click(newChat);
    await expect(args.onNewChat).toHaveBeenCalledTimes(1);
    await expect(args.onSettings).not.toHaveBeenCalled();
    await userEvent.click(settings);
    await expect(args.onSettings).toHaveBeenCalledTimes(1);
    await expect(settings.getBoundingClientRect().top).toBeGreaterThan(
      newChat.getBoundingClientRect().bottom,
    );
  },
};
