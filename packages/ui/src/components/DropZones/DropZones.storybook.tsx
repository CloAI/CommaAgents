import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DropZones } from "./DropZones";

const meta = {
  title: "Components/DropZones",
  component: DropZones,
  args: { onDrop: fn(), selectable: true },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 500, height: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DropZones>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const ChooseReturnDestination: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    for (const edge of ["left", "right", "top", "bottom"]) {
      await userEvent.click(
        canvas.getByRole("button", { name: `Return chat to ${edge}` }),
      );
      await expect(args.onDrop).toHaveBeenCalledWith(edge);
    }
    canvas.getByRole("button", { name: "Return chat to top" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onDrop).toHaveBeenLastCalledWith("top");
  },
};
