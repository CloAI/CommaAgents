import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { ChatPaneContext } from "../../hooks/useChatPane";
import {
  answerCommand,
  requests,
} from "../../hooks/useCommaAgentsDaemon/test.utils";
import {
  AppProviders,
  answerStrategyLists,
  openSocket,
  prepareStory,
} from "../../test.utils";
import type { ListedStrategy } from "../../test.utils";
import { NewChat } from "./NewChat";

const PLAN: ListedStrategy = {
  name: "Plan",
  label: "Plan",
  version: "1.0.0",
  path: "/work/.comma/strategies/plan.json",
  origin: "cwd",
};
const TALK: ListedStrategy = {
  name: "Talk",
  label: "Talk",
  version: "2.0",
  path: "/core/strategies/talk.json",
  origin: "bundled",
};

// Stands in for the run page so the story can see where the pane went.
function OpenedRun() {
  const { runId } = useParams();
  return <p>Opened run {runId}</p>;
}

// Render pages inside one pane's router, the way the workspace does.
function Pane({ paneId }: { readonly paneId: string }) {
  return (
    <ChatPaneContext.Provider value={{ paneId }}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<NewChat />} />
          <Route path="/runs/:runId" element={<OpenedRun />} />
        </Routes>
      </MemoryRouter>
    </ChatPaneContext.Provider>
  );
}

const meta = {
  title: "Pages/NewChat",
  component: NewChat,
  render: () => (
    <AppProviders>
      <Pane paneId="pane-1" />
    </AppProviders>
  ),
  beforeEach: () =>
    prepareStory({
      settings: {
        version: 1,
        daemon: { url: "ws://127.0.0.1:7422/ws" },
        strategyPath: PLAN.path,
        modelOverrides: { [PLAN.path]: { assistant: "openai/gpt-4o" } },
      },
    }),
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The empty chat page of a pane. Submitting prepares and starts a run of the pane's strategy, then the pane opens that run's route.",
      },
    },
  },
} satisfies Meta<typeof NewChat>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const SubmitPreparesStartsAndOpensTheRun: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await answerStrategyLists(socket, [PLAN, TALK]);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Hello{Enter}",
    );
    const prepare = await answerCommand(socket, "runs.prepare", {
      type: "response",
      ok: true,
      data: { runId: "run-1" },
    });
    // The saved per-agent override travels with the run configuration.
    await expect(prepare.arguments).toEqual({
      configuration: {
        strategyPath: PLAN.path,
        modelOverrides: { assistant: "openai/gpt-4o" },
      },
    });
    const start = await answerCommand(socket, "runs.start", {
      type: "response",
      ok: true,
      data: null,
    });
    await expect(start.arguments).toEqual({ runId: "run-1", input: "Hello" });
    await expect(await canvas.findByText("Opened run run-1")).toBeVisible();
  },
};
export const ShowsWhenPreparationIsRejected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await answerStrategyLists(socket, [PLAN]);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    await answerCommand(socket, "runs.prepare", {
      type: "response",
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Could not load strategy" },
    });
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not load strategy",
    );
    await expect(
      requests(socket, "command").some(
        (request) => request.command === "runs.start",
      ),
    ).toBe(false);
  },
};
export const NeedsAStrategy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await answerStrategyLists(socket, []);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Hi{Enter}",
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Choose a strategy first.",
    );
    await expect(
      requests(socket, "command").some(
        (request) => request.command === "runs.prepare",
      ),
    ).toBe(false);
  },
};
export const EachPaneKeepsItsOwnStrategyPick: Story = {
  render: () => (
    <AppProviders>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <section aria-label="First pane">
          <Pane paneId="pane-1" />
        </section>
        <section aria-label="Second pane">
          <Pane paneId="pane-2" />
        </section>
      </div>
    </AppProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = within(canvas.getByRole("region", { name: "First pane" }));
    const second = within(canvas.getByRole("region", { name: "Second pane" }));
    const socket = await openSocket();
    await answerStrategyLists(socket, [PLAN, TALK]);
    const trigger = (pane: typeof first) =>
      pane.getByRole("button", { name: /^Strategy:/ });
    await waitFor(() => expect(trigger(first)).toHaveTextContent("Plan"));
    await waitFor(() => expect(trigger(second)).toHaveTextContent("Plan"));
    await userEvent.click(trigger(first));
    await userEvent.click(first.getByRole("option", { name: /^Talk/ }));
    await expect(trigger(first)).toHaveTextContent("Talk");
    // The other pane keeps the default.
    await expect(trigger(second)).toHaveTextContent("Plan");
  },
};
