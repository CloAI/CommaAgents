import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { ModelPagination } from "./ModelPagination";

function Example() {
  const [page, setPage] = useState(0);
  return (
    <ModelPagination
      label="Example model pages"
      page={page}
      pageCount={3}
      onPageChange={setPage}
    />
  );
}
const meta = {
  title: "Components/SettingsDialog/ProvidersSettings/ModelPagination",
  component: ModelPagination,
  args: {
    label: "Example model pages",
    page: 0,
    pageCount: 3,
    onPageChange: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Retained for future use. Paging is currently commented out in ProviderModels.",
      },
    },
  },
} satisfies Meta<typeof ModelPagination>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
export const PageControls: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(canvas.getByText("Page 2 of 3")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(canvas.getByText("Page 2 of 3")).toBeVisible();
  },
};
export const SinglePage: Story = { args: { pageCount: 1 } };
