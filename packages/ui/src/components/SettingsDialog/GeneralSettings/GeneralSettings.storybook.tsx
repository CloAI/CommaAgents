import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { GeneralSettingsRender } from "./GeneralSettings";

const meta = {
  title: "Components/SettingsDialog/GeneralSettings",
  component: GeneralSettingsRender,
  args: {
    inputId: "daemon-endpoint",
    inputRef: null,
    url: "ws://127.0.0.1:7422/ws",
    error: null,
    onChange: fn(),
  },
} satisfies Meta<typeof GeneralSettingsRender>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Invalid: Story = {
  args: {
    url: "https://daemon.example/ws",
    error: "Use a full ws:// or wss:// URL with a hostname.",
  },
};
