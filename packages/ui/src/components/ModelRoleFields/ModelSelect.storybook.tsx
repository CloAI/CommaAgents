import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ModelSelect } from "./ModelSelect";

const longModel = `openai/${"long-model-name-".repeat(12)}`;
const meta = {
  title: "Components/ModelSelect",
  component: ModelSelect,
  args: {
    label: "Model for @complex",
    value: longModel,
    onChange: fn(),
    models: {
      status: "ready",
      groups: ["OpenAI"],
      choices: [
        {
          value: longModel,
          label: longModel,
          group: "OpenAI",
          capabilities: undefined,
        },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640, maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModelSelect>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const CapsLongLabelsAndFitsNarrowContainers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: /^Model for @complex:/,
    });
    const cap =
      20 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(
      cap,
    );
    await userEvent.click(trigger);
    const panel = canvas.getByRole("dialog", { name: "Model for @complex" });
    await waitFor(() =>
      expect(panel.getBoundingClientRect().width).toBeLessThanOrEqual(cap),
    );
    await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    await userEvent.keyboard("{Escape}");
    const container = trigger.parentElement!.parentElement!.parentElement!;
    container.style.width = "220px";
    await expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(
      220,
    );
    await expect(container.scrollWidth).toBeLessThanOrEqual(220);
  },
};
