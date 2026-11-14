import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { exampleProviders } from "../SettingsDialog/ProvidersSettings/test.utils";
import { ModelDetails } from "./ModelDetails";

const meta = {
  title: "Components/ModelDetails",
  component: ModelDetails,
  args: {
    provider: exampleProviders[1]!,
    model: exampleProviders[1]!.models[0]!,
    highlightSearchQuery: "",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxWidth: "32rem",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModelDetails>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Capabilities: Story = {};
export const UnknownCapabilities: Story = {
  args: {
    provider: exampleProviders[0]!,
    model: exampleProviders[0]!.models[2]!,
  },
};
export const IdWithoutDisplayName: Story = {
  args: {
    model: {
      id: "custom-model-without-a-display-name",
      sources: ["user"],
      metadata: {},
    },
  },
};
export const HighlightedSearch: Story = {
  args: { highlightSearchQuery: "round" },
};
export const Actions: Story = {
  args: { actions: [{ label: "Remove saved entry", action: fn() }] },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Remove saved entry" }),
    );
    await expect(args.actions![0]!.action).toHaveBeenCalledOnce();
  },
};
export const Narrow: Story = {
  args: {
    model: {
      ...exampleProviders[1]!.models[0]!,
      id: "a-very-long-provider-specific-model-identifier-with-version-and-region-suffix",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
