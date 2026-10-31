import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { CommaAgentsDaemonProvider } from "../../hooks/useCommaAgentsDaemon";
import { deliver, requests } from "../../hooks/useCommaAgentsDaemon/test.utils";
import { SettingsProvider } from "../../hooks/useSettings";
import { MockWebSocket } from "../../hooks/useWebSocket/test.utils";
import type { DescribedStrategy } from "../../hooks/useStrategyModels";
import { SETTINGS_STORAGE_KEY } from "../../settings/settings.constants";
import type { DiscoveredProvider } from "../ModelBrowser";
import { StrategyModels, StrategyModelsRender } from "./StrategyModels";
const PATH = "/work/.comma/strategies/plan.json";
const STRATEGY: DescribedStrategy = {
  name: "Plan and build",
  version: "1.0.0",
  agents: [
    { name: "asker", kind: "user" },
    {
      name: "planner",
      kind: "llm",
      description: "Plans the work.",
      model: "openai/gpt-4o",
      privacy: { tee: "required", e2ee: "required" },
    },
    { name: "builder", kind: "llm", model: "anthropic/claude-sonnet" },
    { name: "reviewer", kind: "llm", model: "openai/missing-model" },
  ],
  steps: [
    {
      flow: "main",
      flowType: "sequential",
      depth: 0,
      agent: "asker",
      role: "step",
      description: "Collect the goal",
    },
    {
      flow: "main",
      flowType: "sequential",
      depth: 0,
      agent: "planner",
      role: "step",
    },
    {
      flow: "loop",
      flowType: "cycle",
      depth: 1,
      agent: "builder",
      role: "step",
    },
    {
      flow: "loop",
      flowType: "cycle",
      depth: 1,
      agent: "planner",
      role: "step",
    },
    {
      flow: "loop",
      flowType: "cycle",
      depth: 1,
      agent: "reviewer",
      role: "observer",
    },
  ],
};
// Two agents that share one model, so the quick selector applies.
const UNIFORM: DescribedStrategy = {
  name: "Write and edit",
  version: "1.0.0",
  agents: [
    { name: "writer", kind: "llm", model: "openai/gpt-4o" },
    { name: "editor", kind: "llm", model: "openai/gpt-4o" },
  ],
  steps: [
    {
      flow: "main",
      flowType: "sequential",
      depth: 0,
      agent: "writer",
      role: "step",
    },
    {
      flow: "main",
      flowType: "sequential",
      depth: 0,
      agent: "editor",
      role: "step",
    },
  ],
};
// One agent that requires TEE and E2EE.
const PRIVATE: DescribedStrategy = {
  name: "Private",
  version: "1.0.0",
  agents: [
    {
      name: "analyst",
      kind: "llm",
      model: "openai/private-model",
      privacy: { tee: "required", e2ee: "required" },
    },
  ],
  steps: [
    {
      flow: "main",
      flowType: "sequential",
      depth: 0,
      agent: "analyst",
      role: "step",
    },
  ],
};
const PROVIDERS: readonly DiscoveredProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    credentialType: "api",
    authStatus: "configured",
    models: [
      {
        id: "gpt-4o",
        sources: ["models.dev"],
        metadata: {
          name: "GPT-4o",
        },
      },
      {
        id: "private-model",
        sources: ["models.dev"],
        metadata: {
          name: "Private model",
          capabilities: { teeAttestation: true, e2ee: true },
        },
      },
    ],
    origin: "catalog",
    discovery: {
      status: "catalog_only",
    },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    credentialType: "api",
    authStatus: "configured",
    models: [
      {
        id: "claude-sonnet",
        sources: ["models.dev"],
        metadata: {
          name: "Claude Sonnet",
        },
      },
    ],
    origin: "catalog",
    discovery: {
      status: "catalog_only",
    },
  },
  {
    id: "vault",
    name: "Vault",
    credentialType: "api",
    authStatus: "none",
    models: [
      {
        id: "vault-model",
        sources: ["models.dev"],
        metadata: {
          name: "Vault model",
        },
      },
    ],
    origin: "catalog",
    discovery: {
      status: "catalog_only",
    },
  },
];
const meta = {
  title: "Components/StrategyModels",
  component: StrategyModelsRender,
  args: { status: "ready", agentCount: 3, overriddenCount: 0, onOpen: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "Summary trigger for the models a strategy uses. Opens a dialog listing every step with its effective model, where each LLM agent's model can be changed or reset. Overrides apply per agent and are saved per strategy.",
      },
    },
  },
} satisfies Meta<typeof StrategyModelsRender>;
// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button", {
      name: /^Strategy models/,
    });
    await expect(trigger).toHaveTextContent("3 models");
    await userEvent.click(trigger);
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
  },
};
export const Overridden: Story = {
  args: { overriddenCount: 2 },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: /^Strategy models/ }),
    ).toHaveTextContent("3 models - 2 overridden");
  },
};
export const SingleModel: Story = {
  args: { agentCount: 1 },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: /^Strategy models/ }),
    ).toHaveTextContent("1 model");
  },
};
export const Loading: Story = {
  args: { status: "loading", agentCount: 0 },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button");
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveTextContent("Loading models...");
  },
};
export const Unavailable: Story = {
  args: { status: "error", agentCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent(
      "Models unavailable",
    );
  },
};
export const None: Story = {
  args: { status: "none", agentCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent(
      "No models",
    );
  },
};
/** Run the real hooks against a scripted daemon socket. */
const connected = {
  render: () => (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <StrategyModels strategyPath={PATH} />
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  ),
  beforeEach: () => {
    const originalWebSocket = globalThis.WebSocket;
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const previous = localStorage.getItem(SETTINGS_STORAGE_KEY);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    return () => {
      globalThis.WebSocket = originalWebSocket;
      if (previous === null) localStorage.removeItem(SETTINGS_STORAGE_KEY);
      else localStorage.setItem(SETTINGS_STORAGE_KEY, previous);
    };
  },
} satisfies Story;
// Answer the most recent request for a command.
async function answer(command: string, message: Record<string, unknown>) {
  const socket = MockWebSocket.instances.at(-1)!;
  await act(() => socket.open());
  const request = requests(socket, "command")
    .filter((candidate) => candidate.command === command)
    .at(-1)!;
  await act(() => deliver(socket, request.requestId, message));
}
const describeOk = (strategy: DescribedStrategy = STRATEGY) =>
  answer("core.strategies.describe", {
    type: "response",
    ok: true,
    data: strategy,
  });
const providersOk = (providers: readonly DiscoveredProvider[] = PROVIDERS) =>
  answer("core.providers.list", {
    type: "response",
    ok: true,
    data: { providers },
  });
const saved = () =>
  JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}")
    .modelOverrides?.[PATH];
// Open the dialog with a described strategy and discovered providers.
async function openDialog(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await describeOk();
  const trigger = await canvas.findByRole("button", {
    name: /^Strategy models/,
  });
  await waitFor(() => expect(trigger).toBeEnabled());
  await userEvent.click(trigger);
  await providersOk();
  const dialog = await canvas.findByRole("dialog", { name: "Strategy models" });
  return { canvas, trigger, dialog: within(dialog) };
}
export const ListsStepsWithStatuses: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const { trigger, dialog } = await openDialog(canvasElement);
    await expect(trigger).toHaveTextContent("3 models");
    await expect(
      dialog.getByRole("region", { name: "main flow" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("region", { name: "loop flow" }),
    ).toBeVisible();
    await expect(dialog.getByText("Asks you for input")).toBeVisible();
    await expect(dialog.getAllByText("Shared by 2 steps")).toHaveLength(2);
    await expect(dialog.getByText("Observer")).toBeVisible();
    // The reviewer's declared model is not in the catalog.
    await waitFor(() =>
      expect(dialog.getByText("Model not in catalog")).toBeVisible(),
    );
  },
};
export const OverridesAndResetsOneAgent: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const { canvas, trigger, dialog } = await openDialog(canvasElement);
    await userEvent.click(
      dialog.getByRole("button", { name: "Change model for builder" }),
    );
    const picker = within(
      await canvas.findByRole("dialog", { name: "Choose model for builder" }),
    );
    // The current model's provider starts expanded and marked.
    await expect(
      picker.getByRole("button", { name: /^Claude Sonnet Anthropic/ }),
    ).toHaveAttribute("aria-current", "true");
    await userEvent.click(picker.getByRole("button", { name: /^OpenAI: / }));
    await userEvent.click(
      picker.getByRole("button", { name: /^GPT-4o OpenAI/ }),
    );
    await waitFor(() =>
      expect(trigger).toHaveTextContent("3 models - 1 overridden"),
    );
    // Two planner rows already declare this model; the builder now joins them.
    await expect(
      dialog.getAllByText("openai/gpt-4o", { selector: "code" }),
    ).toHaveLength(3);
    await expect(
      dialog.getByText("Strategy default: anthropic/claude-sonnet"),
    ).toBeVisible();
    await expect(saved()).toEqual({ builder: "openai/gpt-4o" });
    await userEvent.click(
      dialog.getByRole("button", { name: "Reset model for builder" }),
    );
    await waitFor(() => expect(trigger).toHaveTextContent("3 models"));
    await expect(trigger).not.toHaveTextContent("overridden");
    await expect(saved()).toBeUndefined();
  },
};
export const PrivacyAndConnectionLimitChoices: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const { canvas, dialog } = await openDialog(canvasElement);
    await userEvent.click(
      dialog.getAllByRole("button", { name: "Change model for planner" })[0]!,
    );
    const picker = within(
      await canvas.findByRole("dialog", { name: "Choose model for planner" }),
    );
    // The planner's current provider starts expanded.
    await userEvent.click(picker.getByRole("button", { name: /^Vault: / }));
    // The planner requires TEE and E2EE.
    await expect(
      picker.getByRole("button", { name: /^GPT-4o OpenAI/ }),
    ).toBeDisabled();
    await expect(picker.getByText("Requires E2EE support")).toBeVisible();
    await expect(
      picker.getByRole("button", { name: /^Vault model Vault/ }),
    ).toBeDisabled();
    await expect(picker.getByText("Not connected")).toBeVisible();
    // A shared agent changes every step that uses it.
    await userEvent.click(
      picker.getByRole("button", { name: /^Private model OpenAI/ }),
    );
    await waitFor(() =>
      expect(
        dialog.getAllByText("openai/private-model", { selector: "code" }),
      ).toHaveLength(2),
    );
    await expect(saved()).toEqual({ planner: "openai/private-model" });
  },
};
export const SetAllSkipsAgentsWhosePrivacyRulesItOut: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const { canvas, trigger, dialog } = await openDialog(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Set all" }));
    const picker = within(
      await canvas.findByRole("dialog", { name: "Choose model for all steps" }),
    );
    await userEvent.click(picker.getByRole("button", { name: /^OpenAI: / }));
    await userEvent.click(
      picker.getByRole("button", { name: /^GPT-4o OpenAI/ }),
    );
    await waitFor(() =>
      expect(trigger).toHaveTextContent("3 models - 2 overridden"),
    );
    await expect(dialog.getByRole("status")).toHaveTextContent(
      "Not applied to planner",
    );
    await expect(saved()).toEqual({
      builder: "openai/gpt-4o",
      reviewer: "openai/gpt-4o",
    });
    await userEvent.click(dialog.getByRole("button", { name: "Reset all" }));
    await waitFor(() => expect(trigger).not.toHaveTextContent("overridden"));
    await expect(
      dialog.getByRole("button", { name: "Reset all" }),
    ).toBeDisabled();
  },
};
export const IgnoresAndDropsStaleOverrides: Story = {
  ...connected,
  beforeEach: () => {
    const cleanup = connected.beforeEach();
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        daemon: { url: "ws://127.0.0.1:7422/ws" },
        modelOverrides: { [PATH]: { ghost: "openai/gpt-4o" } },
      }),
    );
    return cleanup;
  },
  play: async ({ canvasElement }) => {
    const { canvas, trigger, dialog } = await openDialog(canvasElement);
    // An override for an agent the strategy no longer has is not counted.
    await expect(trigger).not.toHaveTextContent("overridden");
    await userEvent.click(
      dialog.getByRole("button", { name: "Change model for builder" }),
    );
    const picker = within(
      await canvas.findByRole("dialog", { name: "Choose model for builder" }),
    );
    await userEvent.click(picker.getByRole("button", { name: /^OpenAI: / }));
    await userEvent.click(
      picker.getByRole("button", { name: /^GPT-4o OpenAI/ }),
    );
    await waitFor(() => expect(saved()).toEqual({ builder: "openai/gpt-4o" }));
  },
};
export const ShowsUnavailableOnDaemonError: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button");
    await answer("core.strategies.describe", {
      type: "response",
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Could not read strategy" },
    });
    await waitFor(() =>
      expect(trigger).toHaveTextContent("Models unavailable"),
    );
    await expect(trigger).toBeDisabled();
  },
};
// Open the quick selector for a strategy whose agents share one model.
async function openQuick(
  canvasElement: HTMLElement,
  strategy: DescribedStrategy,
  providers: readonly DiscoveredProvider[] = PROVIDERS,
) {
  const canvas = within(canvasElement);
  await describeOk(strategy);
  const trigger = await canvas.findByRole("button", { name: /^Model:/ });
  await providersOk(providers);
  await waitFor(() => expect(trigger).toBeEnabled());
  return { canvas, trigger };
}
export const QuickSelectReplacesTheSharedModel: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const { canvas, trigger } = await openQuick(canvasElement, UNIFORM);
    // No per-step trigger while one model serves every agent.
    await expect(
      canvas.queryByRole("button", { name: /^Strategy models/ }),
    ).toBeNull();
    await expect(trigger).toHaveTextContent("openai/gpt-4o");
    await userEvent.click(trigger);
    const search = canvas.getByRole("combobox", { name: "Model search" });
    await userEvent.type(search, "claude");
    await userEvent.click(
      canvas.getByRole("option", { name: /^Claude Sonnet/ }),
    );
    await waitFor(() =>
      expect(trigger).toHaveTextContent("anthropic/claude-sonnet"),
    );
    await expect(canvas.getByText("Overridden")).toBeVisible();
    await expect(saved()).toEqual({
      writer: "anthropic/claude-sonnet",
      editor: "anthropic/claude-sonnet",
    });
    await userEvent.click(canvas.getByRole("button", { name: "Reset model" }));
    await waitFor(() => expect(trigger).toHaveTextContent("openai/gpt-4o"));
    await expect(canvas.queryByText("Overridden")).toBeNull();
    await expect(saved()).toBeUndefined();
  },
};
export const QuickSelectDisablesModelsThatBreakPrivacy: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const { canvas, trigger } = await openQuick(canvasElement, PRIVATE);
    await userEvent.click(trigger);
    const blocked = canvas.getByRole("option", { name: /^GPT-4o/ });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    // Every model without E2EE support shows the reason.
    await expect(
      canvas.getAllByText("Requires E2EE support").length,
    ).toBeGreaterThan(0);
    await userEvent.click(blocked);
    await expect(saved()).toBeUndefined();
    await expect(
      canvas.getByRole("option", { name: /^Private model/ }),
    ).not.toHaveAttribute("aria-disabled");
  },
};
export const QuickSelectNeedsAConnectedProvider: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await describeOk(UNIFORM);
    const trigger = await canvas.findByRole("button", { name: /^Model:/ });
    await providersOk([PROVIDERS[2]!]);
    await waitFor(() =>
      expect(trigger).toHaveTextContent("No connected providers"),
    );
    await expect(trigger).toBeDisabled();
  },
};
export const StepsButtonOpensTheDialogAndDivergenceSwitchesControl: Story = {
  ...connected,
  play: async ({ canvasElement }) => {
    const { canvas } = await openQuick(canvasElement, UNIFORM);
    await userEvent.click(canvas.getByRole("button", { name: "Steps" }));
    await providersOk();
    const dialog = within(
      await canvas.findByRole("dialog", { name: "Strategy models" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Change model for writer" }),
    );
    const picker = within(
      await canvas.findByRole("dialog", { name: "Choose model for writer" }),
    );
    await userEvent.click(picker.getByRole("button", { name: /^Anthropic: / }));
    await userEvent.click(
      picker.getByRole("button", { name: /^Claude Sonnet Anthropic/ }),
    );
    // The models now differ, so the per-step trigger replaces the quick selector.
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /^Strategy models/ }),
      ).toHaveTextContent("2 models - 1 overridden"),
    );
    await expect(canvas.queryByRole("button", { name: /^Model:/ })).toBeNull();
    // The dialog stays open through the switch.
    await expect(
      canvas.getByRole("dialog", { name: "Strategy models" }),
    ).toBeVisible();
  },
};
