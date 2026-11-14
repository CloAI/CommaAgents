import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { TitleIcon, TitleIconRender } from "./TitleIcon";
import framesData from "./frames.json";

const meta = {
  title: "Components/TitleIcon",
  component: TitleIcon,
  parameters: {
    docs: {
      description: {
        component:
          "Copied TUI ASCII frames, played at 16 fps. The system reduced-motion preference shows a static frame. There are no playback controls.",
      },
    },
  },
} satisfies Meta<typeof TitleIcon>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Animated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const logo = canvas.getByRole("img", { name: "Comma Agents logo" });
    const initialFrame = logo.textContent;
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(logo.textContent).not.toBe(initialFrame));
  },
};
export const ReducedMotion: Story = {
  render: () => (
    <TitleIconRender frame={framesData.frames[0]?.join("\n") ?? ""} />
  ),
};
