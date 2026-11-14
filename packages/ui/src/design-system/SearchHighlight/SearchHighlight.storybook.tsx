import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { SearchHighlight } from "./SearchHighlight";

const meta = {
  title: "Design System/SearchHighlight",
  component: SearchHighlight,
  args: { text: "Review the UI, then review the daemon.", query: "review" },
} satisfies Meta<typeof SearchHighlight>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const RepeatedMatches: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      Array.from(
        canvasElement.querySelectorAll("mark"),
        (mark) => mark.textContent,
      ),
    ).toEqual(["Review", "review"]);
  },
};
export const CaseInsensitive: Story = {
  args: { query: "  REVIEW  " },
  play: RepeatedMatches.play,
};
export const LiteralCharacters: Story = {
  args: { text: "model[1] and model[2] <script> are plain text", query: "[1]" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("mark")).toHaveTextContent("[1]");
    await expect(canvasElement.querySelector("script")).toBeNull();
  },
};
export const EmptyQuery: Story = {
  args: { query: " " },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("mark")).toBeNull();
  },
};
export const NoMatch: Story = { ...EmptyQuery, args: { query: "missing" } };
