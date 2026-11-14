import { act, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useStartRun } from "../../hooks/runs";
import { useLayout } from "../../hooks/useLayout";
import {
  acknowledgeSubscription,
  answerCommand,
  deliver,
  requests,
} from "../../hooks/useCommaAgentsDaemon/test.utils";
import { AppProviders, openSocket, prepareStory } from "../../test.utils";
import { WorkspacesProvider } from "../../hooks/useWorkspaces/useWorkspaces.context";
import { useWorkspaces } from "../../hooks/useWorkspaces/useWorkspaces";
import type { ClientWorkspaceStore } from "../../hooks/useLayout/useLayout.types";

const saved: ClientWorkspaceStore = {
  activeProjectId: "general",
  workspaces: {
    general: {
      projectId: "general",
      state: {
        layout: {
          root: {
            type: "pane",
            id: "general-pane",
            path: "/runs/general-chat",
          },
          activeId: "general-pane",
        },
        strategyChoices: {},
        paneCollections: {
          "general-pane": {
            paneId: "general-pane",
            chatIds: ["general-chat"],
            selectedChatId: "general-chat",
            closed: false,
          },
        },
      },
    },
    named: {
      projectId: "named",
      state: {
        layout: {
          root: { type: "pane", id: "named-pane", path: "/runs/named-chat" },
          activeId: "named-pane",
        },
        strategyChoices: {},
        paneCollections: {
          "named-pane": {
            paneId: "named-pane",
            chatIds: ["named-chat", "older-chat"],
            selectedChatId: "named-chat",
            closed: false,
          },
        },
      },
    },
  },
};
const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
const attention = {
  running: false,
  question: false,
  permission: false,
  failed: false,
};
const catalog = {
  projects: [
    { projectId: "general", name: "General", cwd: "/general", createdAt: old },
    { projectId: "named", name: "Named", cwd: "/named", createdAt: old },
  ],
  chats: [
    {
      runId: "general-chat",
      projectId: "general",
      title: "General chat",
      lastActivityAt: old,
      attention,
    },
    {
      runId: "named-chat",
      projectId: "named",
      title: "Named chat",
      lastActivityAt: old,
      attention,
    },
    {
      runId: "older-chat",
      projectId: "named",
      title: "Older chat",
      lastActivityAt: old,
      attention,
    },
    {
      runId: "waiting",
      projectId: "general",
      title: "Question",
      lastActivityAt: old,
      attention: { ...attention, question: true },
    },
  ],
};
function LifecycleProbe() {
  const workspaces = useWorkspaces();
  const launch = useStartRun();
  const [startedId, setStartedId] = useState<string>();
  const [closed, setClosed] = useState<boolean>();
  const layout = useLayout();
  const pane = layout.layout.root;
  return (
    <div>
      <button
        onClick={() =>
          void launch
            .start(
              {
                name: "Plan",
                label: "Plan",
                version: "1",
                path: "/strategy.json",
                origin: "cwd",
              },
              "Hello",
            )
            .then(setStartedId)
        }
      >
        Launch run
      </button>
      {startedId && <output aria-label="Started">{startedId}</output>}
      {launch.error && <p role="alert">{launch.error}</p>}
      <output aria-label="Project">{workspaces.projectId}</output>
      <output aria-label="Pane">{layout.layout.activeId}</output>
      <output aria-label="Route">
        {pane.type === "pane" ? pane.path : "split"}
      </output>
      <button onClick={() => workspaces.switchProject("named")}>
        Switch named
      </button>
      <button
        onClick={() =>
          workspaces.revealChat(
            workspaces.chats.find((chat) => chat.runId === "general-chat")!,
          )
        }
      >
        Reveal General chat
      </button>
      <button onClick={layout.newChat}>New chat in pane</button>
      <button
        onClick={() =>
          void workspaces
            .archiveChat("general-chat", { done: false, stopRunning: true })
            .then(setClosed)
        }
      >
        Close active chat
      </button>
      <output aria-label="Closed">{String(closed)}</output>
    </div>
  );
}
const meta = {
  title: "Hooks/Workspaces",
  component: LifecycleProbe,
  render: () => (
    <AppProviders>
      <WorkspacesProvider>
        <LifecycleProbe />
      </WorkspacesProvider>
    </AppProviders>
  ),
  beforeEach: () => {
    const previous = localStorage.getItem("comma-agents.workspaces");
    const cleanup = prepareStory();
    localStorage.setItem("comma-agents.workspaces", JSON.stringify(saved));
    return () => {
      cleanup();
      if (previous === null) {
        localStorage.removeItem("comma-agents.workspaces");
      } else {
        localStorage.setItem("comma-agents.workspaces", previous);
      }
    };
  },
} satisfies Meta<typeof LifecycleProbe>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
export const RestoresLayoutsAndProtectsSavedDisplayedChats: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const watch = await acknowledgeSubscription(socket, "projects.watch");
    await act(() =>
      deliver(socket, watch.requestId, {
        type: "projects.updated",
        data: catalog,
      }),
    );
    const archived = await answerCommand(socket, "projects.archive", {
      type: "response",
      ok: true,
      data: { ...catalog.chats[2], archivedAt: new Date().toISOString() },
    });
    await expect(archived.arguments).toEqual({ runId: "older-chat" });
    await expect(
      requests(socket, "command").filter(
        (request) => request.command === "projects.archive",
      ),
    ).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Switch named" }));
    await expect(canvas.getByLabelText("Project")).toHaveTextContent("named");
    await expect(canvas.getByLabelText("Pane")).toHaveTextContent("named-pane");
    await expect(canvas.getByLabelText("Route")).toHaveTextContent(
      "/runs/named-chat",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "New chat in pane" }),
    );
    await expect(canvas.getByLabelText("Pane")).toHaveTextContent("named-pane");
    await expect(canvas.getByLabelText("Route")).toHaveTextContent("/");
    await userEvent.click(
      canvas.getByRole("button", { name: "Reveal General chat" }),
    );
    await expect(canvas.getByLabelText("Project")).toHaveTextContent("general");
    await expect(canvas.getByLabelText("Route")).toHaveTextContent(
      "/runs/general-chat",
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("comma-agents.workspaces")!).workspaces
          .named.state.paneCollections["named-pane"].chatIds,
      ).toEqual(["named-chat", "older-chat"]),
    );
  },
};

export const AssignsBeforeStartingAndGuardsWorkspaceChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const watch = await acknowledgeSubscription(socket, "projects.watch");
    await act(() =>
      deliver(socket, watch.requestId, {
        type: "projects.updated",
        data: catalog,
      }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Launch run" }));
    await userEvent.click(canvas.getByRole("button", { name: "Switch named" }));
    await expect(canvas.getByLabelText("Project")).toHaveTextContent("general");
    const prepared = await answerCommand(socket, "runs.prepare", {
      type: "response",
      ok: true,
      data: { runId: "new-run" },
    });
    await expect(prepared.arguments).toMatchObject({
      configuration: { cwd: "/general", strategyPath: "/strategy.json" },
    });
    await waitFor(() =>
      expect(
        requests(socket, "command").some(
          (request) => request.command === "projects.assign",
        ),
      ).toBe(true),
    );
    await expect(
      requests(socket, "command").some(
        (request) => request.command === "runs.start",
      ),
    ).toBe(false);
    const assigned = await answerCommand(socket, "projects.assign", {
      type: "response",
      ok: true,
      data: { ...catalog.chats[0], runId: "new-run" },
    });
    await expect(assigned.arguments).toEqual({
      projectId: "general",
      runId: "new-run",
      title: "Hello",
    });
    await answerCommand(socket, "runs.start", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(await canvas.findByLabelText("Started")).toHaveTextContent(
      "new-run",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Switch named" }));
    await expect(canvas.getByLabelText("Project")).toHaveTextContent("named");
  },
};

/** Confirmed closing waits for stopping; failures preserve the current conversation. */
export const StopsBeforeClosingAndPreservesOnFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    const watch = await acknowledgeSubscription(socket, "projects.watch");
    await act(() =>
      deliver(socket, watch.requestId, {
        type: "projects.updated",
        data: {
          ...catalog,
          chats: catalog.chats.map((chat) => ({
            ...chat,
            lastActivityAt: new Date().toISOString(),
            attention:
              chat.runId === "general-chat"
                ? { ...attention, running: true }
                : chat.attention,
          })),
        },
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Close active chat" }),
    );
    const failedStop = await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: false,
      error: { code: "STOP_FAILED", message: "Could not stop" },
    });
    await expect(failedStop.arguments).toEqual({ runId: "general-chat" });
    await expect(await canvas.findByLabelText("Closed")).toHaveTextContent(
      "false",
    );
    await expect(canvas.getByLabelText("Route")).toHaveTextContent(
      "/runs/general-chat",
    );
    await expect(
      requests(socket, "command").filter(
        (request) => request.command === "projects.archive",
      ),
    ).toHaveLength(0);
    await userEvent.click(
      canvas.getByRole("button", { name: "Close active chat" }),
    );
    await waitFor(() =>
      expect(
        requests(socket, "command").filter(
          (request) => request.command === "runs.stop",
        ),
      ).toHaveLength(2),
    );
    await expect(
      requests(socket, "command").filter(
        (request) => request.command === "projects.archive",
      ),
    ).toHaveLength(0);
    await answerCommand(socket, "runs.stop", {
      type: "response",
      ok: true,
      data: null,
    });
    const archived = await answerCommand(socket, "projects.archive", {
      type: "response",
      ok: true,
      data: { ...catalog.chats[0], archivedAt: new Date().toISOString() },
    });
    await expect(archived.arguments).toEqual({
      runId: "general-chat",
      done: false,
    });
    await waitFor(() =>
      expect(canvas.getByLabelText("Closed")).toHaveTextContent("true"),
    );
    await expect(canvas.getByLabelText("Route")).toHaveTextContent("/");
  },
};
