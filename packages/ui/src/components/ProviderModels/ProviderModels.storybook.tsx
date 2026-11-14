import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { exampleProviders } from "../SettingsDialog/ProvidersSettings/test.utils";
import { ModelDetails } from "../ModelDetails";
import { ProviderModels } from "./ProviderModels";

const provider = exampleProviders[0]!;
const meta = {
  title: "Components/ProviderModels",
  component: ProviderModels,
  args: {
    provider,
    models: provider.models,
    searchQuery: "",
    renderModel: (model) => (
      <ModelDetails provider={provider} model={model} highlightSearchQuery="" />
    ),
  },
} satisfies Meta<typeof ProviderModels>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole("button", { name: /Alpha/ });
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    heading.focus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByText("Vision tools")).toBeVisible();
    await userEvent.keyboard(" ");
    await expect(heading).toHaveAttribute("aria-expanded", "false");
  },
};
export const Expanded: Story = { args: { defaultExpanded: true } };
export const NeedsCredentials: Story = {
  args: { provider: { ...provider, authStatus: "none" } },
};
export const Verified: Story = {
  args: {
    verification: {
      providerId: "alpha",
      status: "verified",
      checkedAt: "2026-10-31T12:00:00Z",
    },
  },
};
export const VerificationFailed: Story = {
  args: {
    verification: {
      providerId: "alpha",
      status: "invalid_credentials",
      checkedAt: "2026-10-31T12:00:00Z",
    },
  },
};
export const Empty: Story = {
  args: { provider: exampleProviders[2]!, models: [], defaultExpanded: true },
};
export const Narrow: Story = {
  ...Expanded,
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
