import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppProviders, openSocket, prepareStory } from "../../../../test.utils";
import {
  answerCommand,
  requests,
} from "../../../../hooks/useCommaAgentsDaemon/test.utils";
import { exampleProviders } from "../test.utils";
import { RemoveModelDialog } from "./RemoveModelDialog";

const meta = {
  title: "Components/SettingsDialog/ProvidersSettings/RemoveModelDialog",
  component: RemoveModelDialog,
  args: {
    provider: exampleProviders[0]!,
    modelId: "custom-reviewer",
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <AppProviders>
        <Story />
      </AppProviders>
    ),
  ],
  beforeEach: () => prepareStory(),
} satisfies Meta<typeof RemoveModelDialog>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmation: Story = {};
export const Cancel: Story = {
  play: async ({ canvasElement, args }) => {
    const socket = await openSocket();
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Cancel" }),
    );
    await expect(args.onClose).toHaveBeenCalledOnce();
    await expect(requests(socket, "command")).toHaveLength(0);
  },
};
export const Busy: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await expect(
      canvas.getByRole("button", { name: "Saving..." }),
    ).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Close dialog" }));
    await expect(args.onClose).not.toHaveBeenCalled();
    await expect(requests(socket, "command")).toHaveLength(1);
  },
};
export const RemovesOnlyTheSavedEntry: Story = {
  play: async ({ canvasElement, args }) => {
    const socket = await openSocket();
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Remove" }),
    );
    const request = await answerCommand(
      socket,
      "core.providers.removeCustomProviderModel",
      { type: "response", ok: true, data: {} },
    );
    await expect(request.arguments).toEqual({
      providerId: "alpha",
      modelId: "custom-reviewer",
    });
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
export const FailureAndRetry: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await answerCommand(socket, "core.providers.removeCustomProviderModel", {
      type: "response",
      ok: false,
      error: {
        code: "PROVIDER_STORAGE_ERROR",
        message: "Could not save provider settings.",
      },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent("Could not save");
    await expect(args.onClose).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(requests(socket, "command")).toHaveLength(2));
    await answerCommand(socket, "core.providers.removeCustomProviderModel", {
      type: "response",
      ok: true,
      data: {},
    });
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
