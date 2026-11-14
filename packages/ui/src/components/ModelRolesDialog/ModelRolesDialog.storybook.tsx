import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppProviders, openSocket, prepareStory } from "../../test.utils";
import {
  acknowledgeSubscription,
  answerCommand,
  deliver,
} from "../../hooks/useCommaAgentsDaemon/test.utils";
import { publishProviders } from "../SettingsDialog/ProvidersSettings/ProviderConfigurationDialog/test.utils";
import { exampleProviders } from "../SettingsDialog/ProvidersSettings/test.utils";
import { ModelRolesDialog } from "./ModelRolesDialog";

const meta = {
  title: "Components/ModelRolesDialog",
  component: ModelRolesDialog,
  args: { roles: ["simple", "complex"], onSaved: fn(), onCancel: fn() },
  decorators: [
    (Story) => (
      <AppProviders>
        <Story />
      </AppProviders>
    ),
  ],
  beforeEach: () => prepareStory(),
} satisfies Meta<typeof ModelRolesDialog>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const MissingRoles: Story = {};

export const IncompleteSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await openSocket();
    await publishProviders(exampleProviders);
    await userEvent.click(
      canvas.getByRole("button", { name: /^Model for @simple:/ }),
    );
    await userEvent.click(
      within(document.body).getByRole("option", { name: /Vision tools/ }),
    );
    await expect(
      canvas.getByRole("button", { name: "Save and continue" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onCancel).toHaveBeenCalledOnce();
    await expect(args.onSaved).not.toHaveBeenCalled();
  },
};

export const SaveAndContinue: Story = {
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
        data: { modelRoles: { existing: "alpha/reasoner" }, defaults: [] },
      }),
    );
    await publishProviders(exampleProviders);
    await userEvent.click(
      canvas.getByRole("button", { name: /^Use one model for every role:/ }),
    );
    await userEvent.click(
      within(document.body).getByRole("option", { name: /Vision tools/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    const request = await answerCommand(socket, "core.modelRoles.set", {
      type: "response",
      ok: true,
      data: {},
    });
    await expect(request.arguments).toEqual({
      modelRoles: {
        existing: "alpha/reasoner",
        simple: "alpha/vision-tools",
        complex: "alpha/vision-tools",
      },
    });
    await expect(args.onSaved).toHaveBeenCalledOnce();
  },
};

export const SaveFailure: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await publishProviders(exampleProviders);
    await userEvent.click(
      canvas.getByRole("button", { name: /^Use one model for every role:/ }),
    );
    await userEvent.click(
      within(document.body).getByRole("option", { name: /Vision tools/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    await answerCommand(socket, "core.modelRoles.set", {
      type: "response",
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: "Model roles could not be saved.",
      },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "could not be saved",
    );
    await expect(
      canvas.getByRole("button", { name: /^Model for @simple:/ }),
    ).toHaveTextContent("alpha/vision-tools");
    await expect(args.onSaved).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Save and continue" }),
    );
    await answerCommand(socket, "core.modelRoles.set", {
      type: "response",
      ok: true,
      data: {},
    });
    await expect(args.onSaved).toHaveBeenCalledOnce();
  },
};
