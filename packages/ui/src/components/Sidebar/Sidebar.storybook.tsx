import { useMemo, useState } from "react";
import { useViewedChats } from "../../hooks/useWorkspaces/useViewedChats";
import type { WorkspaceChat } from "../../hooks/useWorkspaces";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { SidebarRender } from "./Sidebar";

const meta = {
  title: "Components/Sidebar",
  component: SidebarRender,
  args: { onNewChat: fn(), onSettings: fn() },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A fixed 44px icon rail. Each hovered or focused action reveals only its own label; a workspace icon reveals its own chats. The rail and conversation widths stay unchanged.",
      },
    },
  },
} satisfies Meta<typeof SidebarRender>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const newChat = canvas.getByRole("button", { name: "New chat" });
    const settings = canvas.getByRole("button", { name: "Settings" });
    await userEvent.click(newChat);
    await expect(args.onNewChat).toHaveBeenCalledTimes(1);
    await expect(args.onSettings).not.toHaveBeenCalled();
    await userEvent.click(settings);
    await expect(args.onSettings).toHaveBeenCalledTimes(1);
    await expect(settings.getBoundingClientRect().top).toBeGreaterThan(
      newChat.getBoundingClientRect().bottom,
    );
  },
};

const now = new Date("2026-11-13T12:00:00.000Z");
const projects = [
  { projectId: "general", name: "General", cwd: "/general", createdAt: now },
  { projectId: "project", name: "CommaAgents", cwd: "/repo", createdAt: now },
];
const chats = [
  {
    runId: "question",
    projectId: "project",
    title: "Choose architecture",
    lastActivityAt: now,
    attention: {
      running: false,
      question: true,
      permission: false,
      failed: false,
    },
  },
  {
    runId: "permission",
    projectId: "project",
    title: "Review permissions",
    lastActivityAt: now,
    attention: {
      running: false,
      question: false,
      permission: true,
      failed: false,
    },
  },
  {
    runId: "running",
    projectId: "project",
    title: "Build workspace",
    lastActivityAt: now,
    attention: {
      running: true,
      question: false,
      permission: false,
      failed: false,
    },
  },
  {
    runId: "idle",
    projectId: "project",
    title: "Completed review",
    lastActivityAt: now,
    attention: {
      running: false,
      question: false,
      permission: false,
      failed: false,
    },
  },
  {
    runId: "failed",
    projectId: "project",
    title: "Failed build",
    lastActivityAt: now,
    attention: {
      running: false,
      question: false,
      permission: false,
      failed: true,
    },
  },
];
/** Project titles, direct chat rows, separate attention signals, and idle-only completion. */
export const Workspaces: Story = {
  args: {
    projects,
    chats,
    projectId: "project",
    paneHues: { first: 180, second: 300 },
    store: {
      activeProjectId: "project",
      workspaces: {
        project: {
          projectId: "project",
          state: {
            strategyChoices: {},
            layout: {
              root: { type: "pane", id: "first", path: "/runs/idle" },
              activeId: "first",
            },
            paneCollections: {
              first: {
                paneId: "first",
                chatIds: ["question", "permission", "idle"],
                selectedChatId: "idle",
                closed: false,
              },
              second: {
                paneId: "second",
                chatIds: ["running"],
                selectedChatId: "running",
                closed: true,
              },
            },
          },
        },
      },
    },
    onProject: fn(),
    onChat: fn(),
    onCloseChat: fn(async () => true),
    onCreate: fn(),
    onSearchArchive: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const navigation = canvas.getByRole("navigation", { name: "Application" });
    await expect(navigation.getBoundingClientRect().width).toBeCloseTo(44, 0);
    await expect(
      canvas.queryByRole("button", { name: "Workspace menu: CommaAgents" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Open chat: Choose architecture" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("img", { name: "Needs your response" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("img", { name: "Needs your response" }),
    ).toHaveTextContent("?");
    const permission = canvas.getByRole("img", { name: "Permission needed" });
    const failed = canvas.getByRole("img", { name: "Failed" });
    await expect(permission).toBeVisible();
    await expect(permission.querySelector("svg")).not.toBeNull();
    await expect(failed).toBeVisible();
    await expect(failed.querySelector("svg")).not.toBeNull();
    await expect(permission.getBoundingClientRect().right).toBeLessThan(
      navigation.getBoundingClientRect().right,
    );
    await expect(failed.getBoundingClientRect().right).toBeLessThan(
      navigation.getBoundingClientRect().right,
    );
    await waitFor(() =>
      expect(canvas.getByRole("img", { name: "Running" })).toBeVisible(),
    );
    await expect(
      canvas.queryByRole("button", { name: /^(Expand|Collapse) / }),
    ).not.toBeInTheDocument();
    const sharedPane = canvas
      .getByRole("button", { name: "Completed review Viewing" })
      .closest('[data-grouped="true"]');
    await expect(sharedPane).not.toBeNull();
    const compactActive = canvas
      .getByRole("button", { name: "Completed review Viewing" })
      .closest("[data-chat-row]") as HTMLElement;
    await expect(compactActive.getBoundingClientRect().width).toBe(
      compactActive.getBoundingClientRect().height,
    );
    await expect(compactActive.getBoundingClientRect().width).toBe(24);
    const ungrouped = canvas
      .getByRole("button", { name: "Build workspace" })
      .closest('[data-grouped="false"]') as HTMLElement;
    await expect(getComputedStyle(ungrouped).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );

    await expect(
      sharedPane?.contains(canvas.getByText("Choose architecture")),
    ).toBe(true);
    await expect(
      sharedPane?.contains(canvas.getByText("Review permissions")),
    ).toBe(true);
    await expect(
      sharedPane?.contains(canvas.getByText("Build workspace")),
    ).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "CommaAgents" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Open chat: Choose architecture" }),
      ).toBeVisible(),
    );
    await expect(
      canvas.getByRole("button", { name: "Open chat: Review permissions" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open chat: Build workspace" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open chat: Failed build" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Workspace menu: CommaAgents" }),
    ).toBeVisible();
    await expect(navigation.getBoundingClientRect().width).toBeCloseTo(44, 0);
    await expect(
      canvas.getByRole("button", { name: "Completed review Viewing" }),
    ).toBeVisible();

    await expect(
      canvas.queryByRole("button", { name: /^Mark done and new:/ }),
    ).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Completed review Viewing" }),
    );
    await expect(args.onChat).toHaveBeenCalledWith(chats[3]);
    const activeRow = canvas
      .getByRole("button", { name: "Completed review Viewing" })
      .closest('[data-viewing="true"]');
    await expect(activeRow).not.toBeNull();
    const closeButton = canvas.getByRole("button", {
      name: "Close chat: Completed review",
    });
    await expect(
      (activeRow as HTMLElement).getBoundingClientRect().width,
    ).toBeGreaterThan(200);
    await expect(closeButton.getBoundingClientRect().right).toBeCloseTo(
      (activeRow as HTMLElement).getBoundingClientRect().right,
      0,
    );
    const rowGroup = (activeRow as HTMLElement).parentElement!;
    const groupStyle = getComputedStyle(rowGroup);
    await expect(
      (activeRow as HTMLElement).getBoundingClientRect().width,
    ).toBeCloseTo(
      rowGroup.getBoundingClientRect().width -
        parseFloat(groupStyle.paddingLeft) -
        parseFloat(groupStyle.paddingRight),
      0,
    );

    await expect(
      getComputedStyle(activeRow as HTMLElement).backgroundColor,
    ).not.toBe("rgba(0, 0, 0, 0)");
    await expect(
      getComputedStyle(
        canvas.getByRole("button", { name: "Completed review Viewing" }),
      ).backgroundColor,
    ).toBe("rgba(0, 0, 0, 0)");

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Close chat: Completed review",
      }),
    );
    await expect(args.onCloseChat).toHaveBeenCalledWith("idle", false);
    await userEvent.click(
      canvas.getByRole("button", { name: "Close chat: Build workspace" }),
    );
    const confirmation = await canvas.findByRole("dialog", {
      name: "Close running chat?",
    });
    await expect(confirmation).toBeVisible();
    await expect(args.onCloseChat).toHaveBeenCalledTimes(1);
    await userEvent.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );
    await expect(args.onCloseChat).toHaveBeenCalledTimes(1);
    await userEvent.click(
      canvas.getByRole("button", { name: "Close chat: Build workspace" }),
    );
    const confirmed = await canvas.findByRole("dialog", {
      name: "Close running chat?",
    });
    await userEvent.click(
      within(confirmed).getByRole("button", { name: "Stop and close" }),
    );
    await waitFor(() =>
      expect(args.onCloseChat).toHaveBeenCalledWith("running", true),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("dialog", { name: "Close running chat?" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvas.getByRole("button", { name: "Build workspace" }),
    ).toHaveFocus();

    await userEvent.click(
      canvas.getByRole("button", { name: "Workspace menu: CommaAgents" }),
    );
    const options = await canvas.findByRole("menu", {
      name: "CommaAgents options",
    });
    await userEvent.click(
      within(options).getByRole("menuitem", { name: "Search archive" }),
    );
    await expect(args.onSearchArchive).toHaveBeenCalledWith("project");
  },
};

/** Each icon reveals its own label while other items and the rail remain compact. */
export const IndividualLabels: Story = {
  args: { onCreate: fn(), onSearchArchive: fn() },
  render: (args) => (
    <div style={{ display: "flex", height: "100svh" }}>
      <SidebarRender {...args} />
      <main
        tabIndex={0}
        data-testid="conversation"
        style={{ flex: 1, minWidth: 0 }}
      >
        Conversation
      </main>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigation = canvas.getByRole("navigation", { name: "Application" });
    const conversation = canvas.getByTestId("conversation");
    const newChat = canvas.getByRole("button", {
      name: "New chat",
    });
    const label = within(newChat).getByText("New chat");
    await expect(newChat.getBoundingClientRect().left).toBe(
      navigation.getBoundingClientRect().left,
    );
    await expect(newChat.getBoundingClientRect().right).toBe(
      navigation.getBoundingClientRect().right,
    );
    await userEvent.click(conversation);
    await waitFor(() =>
      expect(navigation.getBoundingClientRect().width).toBeCloseTo(44, 0),
    );
    await expect(label).not.toBeVisible();
    const conversationLeft = conversation.getBoundingClientRect().left;
    const conversationWidth = conversation.getBoundingClientRect().width;
    await userEvent.tab({ shift: true });
    const settings = canvas.getByRole("button", { name: "Settings" });
    const settingsLabel = within(settings).getByText("Settings");
    await expect(settings).toHaveFocus();
    await expect(navigation.getBoundingClientRect().width).toBeCloseTo(44, 0);
    await waitFor(() => expect(settingsLabel).toBeVisible());
    await expect(settingsLabel.getBoundingClientRect().left).toBe(
      navigation.getBoundingClientRect().right,
    );
    await expect(getComputedStyle(settingsLabel).opacity).toBe("1");
    await expect(
      getComputedStyle(settingsLabel).transitionProperty,
    ).not.toContain("opacity");
    await expect(label).not.toBeVisible();
    await expect(settingsLabel.getBoundingClientRect().right).toBeGreaterThan(
      navigation.getBoundingClientRect().right,
    );
    await expect(conversation.getBoundingClientRect().left).toBe(
      conversationLeft,
    );
    await expect(conversation.getBoundingClientRect().width).toBe(
      conversationWidth,
    );
    await userEvent.click(conversation);
    await waitFor(() =>
      expect(navigation.getBoundingClientRect().width).toBeCloseTo(44, 0),
    );
    await waitFor(() => expect(label).not.toBeVisible());
  },
};

/**
 * Exercise persistent read state against changing finalized output.
 * @returns {React.ReactElement} Stateful sidebar test harness.
 */
function ReadStatusExample() {
  const [path, setPath] = useState("/");
  const [revision, setRevision] = useState("first-response");
  const [mounted, setMounted] = useState(true);
  const catalog = useMemo(
    () => [
      { ...chats[3]!, runId: "read-status-story", latestEntryId: revision },
    ],
    [revision],
  );
  return (
    <>
      <button
        onClick={() => {
          setPath("/");
          setRevision("second-response");
        }}
      >
        Background output
      </button>
      <button onClick={() => setMounted((value) => !value)}>
        Toggle sidebar
      </button>
      {mounted && (
        <ReadStatusSidebar
          catalog={catalog}
          path={path}
          onOpen={() => setPath("/runs/read-status-story")}
        />
      )}
    </>
  );
}
function ReadStatusSidebar({
  catalog,
  path,
  onOpen,
}: {
  readonly catalog: readonly WorkspaceChat[];
  readonly path: string;
  readonly onOpen: () => void;
}) {
  const layout = useMemo(
    () => ({
      root: { type: "pane" as const, id: "read-pane", path },
      activeId: "read-pane",
    }),
    [path],
  );
  const readChats = useViewedChats(catalog, layout);
  return (
    <SidebarRender
      onNewChat={fn()}
      onSettings={fn()}
      projects={projects}
      chats={readChats}
      projectId="project"
      onChat={onOpen}
    />
  );
}
export const ReadStatus: Story = {
  render: () => <ReadStatusExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    localStorage.removeItem("comma-agents.viewed-chats");
    // A fresh output identity is unread until its pane is actually viewed.
    await expect(
      canvas.getByRole("img", { name: "Unread output" }).querySelector("svg"),
    ).toHaveAttribute("fill", "currentColor");
    await userEvent.click(
      canvas.getByRole("button", { name: "Completed review" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("img", { name: "Viewed" }).querySelector("svg"),
      ).toHaveAttribute("fill", "none"),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle sidebar" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle sidebar" }),
    );
    await expect(canvas.getByRole("img", { name: "Viewed" })).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Background output" }),
    );
    await expect(
      canvas.getByRole("img", { name: "Unread output" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Completed review" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("img", { name: "Viewed" })).toBeVisible(),
    );
    localStorage.removeItem("comma-agents.viewed-chats");
  },
};
