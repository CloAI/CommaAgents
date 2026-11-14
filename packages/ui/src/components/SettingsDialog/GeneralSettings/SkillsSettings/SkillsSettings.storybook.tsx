import type { Meta, StoryObj } from "@storybook/react-vite";
import { act } from "react";
import { expect, fireEvent, userEvent, within } from "storybook/test";
import { SettingsProvider } from "../../../../hooks/useSettings";
import { CommaAgentsDaemonProvider } from "../../../../hooks/useCommaAgentsDaemon";
import {
  answerCommand,
  requests,
} from "../../../../hooks/useCommaAgentsDaemon/test.utils";
import { MockWebSocket } from "../../../../hooks/useWebSocket/test.utils";
import { SkillsSettings } from "./SkillsSettings";

const skills = [
  {
    name: "review-code",
    description: "Review changes for correctness.",
    sourcePath: "/workspace/.comma/skills/review-code/SKILL.md",
    origin: "project",
  },
  {
    name: "write-docs",
    description: "Write useful documentation.",
    sourcePath: "/home/user/.config/comma/skills/write-docs/SKILL.md",
    origin: "global",
  },
];
const meta = {
  title: "Components/SettingsDialog/GeneralSettings/SkillsSettings",
  component: SkillsSettings,
  decorators: [
    (Story) => (
      <SettingsProvider>
        <CommaAgentsDaemonProvider>
          <Story />
        </CommaAgentsDaemonProvider>
      </SettingsProvider>
    ),
  ],
  beforeEach: () => {
    const environment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    const original = globalThis.WebSocket;
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    return () => {
      globalThis.WebSocket = original;
      environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
    };
  },
} satisfies Meta<typeof SkillsSettings>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const SearchAndView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skills" }));
    await expect(canvas.getByText("Loading skills...")).toBeVisible();
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await answerCommand(socket, "skills.list", {
      type: "response",
      ok: true,
      data: { skills, warnings: [] },
    });
    await expect(canvas.getAllByRole("listitem")).toHaveLength(2);
    const search = canvas.getByRole("searchbox", { name: "Search skills" });
    await userEvent.type(search, "REVIEW");
    await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    await expect(canvasElement.querySelectorAll("mark")).toHaveLength(2);
    await userEvent.clear(search);
    await userEvent.type(search, "documentation");
    await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
    await expect(canvasElement.querySelector("mark")).toHaveTextContent(
      "documentation",
    );
    await userEvent.clear(search);
    await userEvent.type(search, "nothing-matches");
    await expect(
      canvas.getByText("No skills match your search."),
    ).toBeVisible();
    await userEvent.clear(search);
    await expect(requests(socket, "command")).toHaveLength(1);
    const trigger = canvas.getByRole("button", {
      name: "View full skill: review-code",
    });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole("dialog", { name: "Skill: review-code" });
    await expect(within(dialog).getByText("Loading skill...")).toBeVisible();
    const content =
      "# Review\n\nRead **every** change.\n<script>raw text</script>";
    const request = await answerCommand(socket, "skills.get", {
      type: "response",
      ok: true,
      data: { skill: { ...skills[0], content }, warnings: [] },
    });
    await expect(request.arguments).toEqual({ name: "review-code" });
    await expect(
      within(dialog).getByLabelText("Raw skill instructions"),
    ).toHaveTextContent("<script>raw text</script>");
    await expect(dialog.querySelector("script")).toBeNull();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skills" }));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await answerCommand(socket, "skills.list", {
      type: "response",
      ok: true,
      data: { skills: [], warnings: [] },
    });
    await expect(canvas.getByText("No skills found.")).toBeVisible();
  },
};

export const LookupError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Skills" }));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await answerCommand(socket, "skills.list", {
      type: "response",
      ok: true,
      data: { skills, warnings: [] },
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "View full skill: review-code" }),
    );
    await answerCommand(socket, "skills.get", {
      type: "response",
      ok: false,
      error: { code: "NOT_FOUND", message: "Skill no longer exists." },
    });
    await expect(
      within(canvas.getByRole("dialog")).getByRole("alert"),
    ).toHaveTextContent("Skill no longer exists.");
  },
};
