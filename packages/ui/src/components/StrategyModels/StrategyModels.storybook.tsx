import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppProviders, openSocket, prepareStory } from "../../test.utils";
import {
  acknowledgeSubscription,
  deliver,
} from "../../hooks/useCommaAgentsDaemon/test.utils";
import { StrategyModels } from "./StrategyModels";

const meta = {
  title: "Components/StrategyModels",
  component: StrategyModels,
  decorators: [
    (Story) => (
      <AppProviders>
        <Story />
      </AppProviders>
    ),
  ],
  beforeEach: () => prepareStory(),
  args: {
    strategyPath: undefined,
    binding: {
      roles: { simple: "openai/custom", complex: "openai/custom" },
      onChange: fn(),
      onReset: fn(),
    },
  },
} satisfies Meta<typeof StrategyModels>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const StagesChangesUntilSave: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(
      socket,
      "core.modelRoles.watch",
    );
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "modelRoles.updated",
        data: {
          modelRoles: { simple: "openai/gpt-5-mini", complex: "openai/gpt-5" },
          defaults: [
            { name: "simple", description: "Fast work" },
            { name: "complex", description: "Hard reasoning" },
          ],
        },
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: /^Strategy models:/ }),
    );
    const dialog = canvas.getByRole("dialog", { name: "Strategy models" });
    let editor = within(dialog);
    await expect(editor.getByText("Overridden", { exact: true })).toBeVisible();
    await expect(
      editor.getByText("Fast work").getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(
      editor
        .getByRole("button", { name: /^Model for @simple:/ })
        .getBoundingClientRect().top,
    );
    await expect(
      editor.queryByRole("combobox", { name: "Model role configuration" }),
    ).not.toBeInTheDocument();
    await expect(
      editor.queryByRole("button", { name: "Save configuration" }),
    ).not.toBeInTheDocument();
    await userEvent.click(editor.getByRole("button", { name: "Reset" }));
    await expect(args.binding.onReset).not.toHaveBeenCalled();
    await expect(args.binding.onChange).not.toHaveBeenCalled();
    await userEvent.click(editor.getByRole("button", { name: "Cancel" }));
    await expect(args.binding.onChange).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: /^Strategy models:/ }),
    );
    editor = within(canvas.getByRole("dialog", { name: "Strategy models" }));
    await userEvent.click(editor.getByRole("button", { name: "Save" }));
    await expect(args.binding.onChange).toHaveBeenLastCalledWith({
      simple: "openai/custom",
      complex: "openai/custom",
    });
    await expect(
      canvas.queryByRole("dialog", { name: "Strategy models" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: /^Strategy models:/ }),
    );
    editor = within(canvas.getByRole("dialog", { name: "Strategy models" }));
    await userEvent.click(editor.getByRole("button", { name: "Reset" }));
    await expect(args.binding.onReset).not.toHaveBeenCalled();
    await userEvent.click(editor.getByRole("button", { name: "Save" }));
    await expect(args.binding.onReset).toHaveBeenCalledOnce();
  },
};
