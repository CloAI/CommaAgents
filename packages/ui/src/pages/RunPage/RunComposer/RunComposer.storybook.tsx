import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, mocked, userEvent, within } from "storybook/test";
import type {
  RunComposer as ComposerState,
  RunStrategy,
  RunSubmission,
  RunStop,
} from "../../../hooks/runs";
import { AppProviders, openSocket, prepareStory } from "../../../test.utils";
import {
  acknowledgeSubscription,
  answerCommand,
  deliver,
} from "../../../hooks/useCommaAgentsDaemon/test.utils";
import { publishProviders } from "../../../components/SettingsDialog/ProvidersSettings/ProviderConfigurationDialog/test.utils";
import { exampleProviders } from "../../../components/SettingsDialog/ProvidersSettings/test.utils";
import { RunComposerRender } from "./RunComposer";
import styles from "../RunPage.module.scss";

const talk = {
  name: "Talk",
  label: "Talk",
  version: "1",
  path: "/strategies/talk.json",
  origin: "bundled" as const,
};
const review = {
  ...talk,
  name: "Review",
  label: "Review",
  path: "/strategies/review.json",
};
const planner = { id: "planner-input", name: "Planner" };
const reviewer = { id: "reviewer-input", name: "Reviewer" };
const composer: ComposerState = {
  mode: "continue",
  recipients: [],
  recipient: undefined,
  selectRecipient: fn(),
  canSubmit: true,
  submit: fn<ComposerState["submit"]>().mockResolvedValue(undefined),
};
const strategy: RunStrategy = {
  status: "ready",
  strategies: [talk, review],
  selected: talk,
  select: fn(),
  changeModels: fn(),
  resetModels: fn(),
  pending: undefined,
  wait: fn(),
  stopAndSwitch: fn(),
  error: undefined,
  isLoading: false,
};
const submission: RunSubmission = {
  send: fn(),
  dialog: undefined,
  choose: fn(),
  cancel: fn(),
  isSubmitting: false,
};
const stop: RunStop = {
  active: false,
  canStop: false,
  isStopping: false,
  stop: fn(),
  error: undefined,
};
const question = {
  runId: "run-preview",
  requestId: "question-1",
  agentName: "Planner",
  toolName: "ask_questions",
  questions: [
    {
      id: "area",
      prompt: "Which area should I review first?",
      fields: [
        {
          id: "answer",
          type: "text" as const,
          label: "Your answer",
          required: true,
        },
      ],
    },
  ],
  ts: "2026-11-01T12:00:00Z",
};
const context = {
  type: "context_required" as const,
  estimatedTokens: 130000,
  tokenLimit: 128000,
  recentCount: 8,
};

const meta = {
  title: "Pages/RunPage/RunComposer",
  component: RunComposerRender,
  args: {
    composer,
    strategy,
    submission,
    stop,
    connected: true,
    savedStrategyName: "Talk",
    questions: [],
    modelRoles: {},
  },
  beforeEach: () => prepareStory(),
  decorators: [
    (Story) => (
      <AppProviders>
        <div
          className={styles.page}
          data-run-page="run-preview"
          style={{
            height: "34rem",
            maxWidth: "52rem",
            justifyContent: "flex-end",
          }}
        >
          <Story />
        </div>
      </AppProviders>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Run-page composer modes, gates, questions, warnings, and decisions. Run state is supplied as typed data; child model and question controls use the mocked daemon.",
      },
    },
  },
} satisfies Meta<typeof RunComposerRender>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Continue: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message" });
    await expect(input).toHaveAttribute(
      "placeholder",
      "Continue the conversation...",
    );
    await userEvent.type(input, "Review the UI.{Enter}");
    await expect(args.composer.submit).toHaveBeenCalledWith("Review the UI.");
    await expect(input).toHaveValue("");
  },
};
export const Initializing: Story = {
  args: {
    savedStrategyName: undefined,
    composer: { ...composer, canSubmit: false },
    strategy: {
      ...strategy,
      status: "loading",
      strategies: [],
      selected: undefined,
    },
  },
};
export const Reply: Story = {
  args: {
    composer: {
      ...composer,
      mode: "reply",
      recipients: [planner],
      recipient: planner,
    },
  },
};
export const Steer: Story = {
  args: {
    composer: {
      ...composer,
      mode: "steer",
      recipients: [planner],
      recipient: planner,
    },
    stop: { ...stop, active: true, canStop: true },
  },
};
export const ChooseReplyRecipient: Story = {
  args: {
    composer: {
      ...composer,
      mode: "reply",
      recipients: [planner, reviewer],
      canSubmit: false,
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("textbox", { name: "Message" }),
    ).toBeDisabled();
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Reply recipient" }),
      reviewer.id,
    );
    await expect(args.composer.selectRecipient).toHaveBeenCalledWith(
      reviewer.id,
    );
  },
};
export const ChooseSteeringRecipient: Story = {
  args: {
    composer: {
      ...composer,
      mode: "steer",
      recipients: [planner, reviewer],
      canSubmit: false,
    },
    stop: { ...stop, active: true, canStop: true },
  },
};
export const SelectedRecipient: Story = {
  args: {
    composer: {
      ...composer,
      mode: "reply",
      recipients: [planner, reviewer],
      recipient: reviewer,
    },
  },
};
export const Offline: Story = {
  args: {
    connected: false,
    composer: { ...composer, canSubmit: false },
    stop: { ...stop, active: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("textbox", { name: "Message" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Stop" })).toBeDisabled();
  },
};
export const StrategyUnavailable: Story = {
  args: {
    composer: { ...composer, canSubmit: false },
    strategy: { ...strategy, selected: undefined },
  },
};
export const StrategyDiscoveryFailed: Story = {
  args: {
    composer: { ...composer, canSubmit: false },
    strategy: {
      ...strategy,
      status: "error",
      selected: undefined,
      strategies: [],
      error: "Strategies could not be loaded.",
    },
  },
};
export const NoStrategies: Story = {
  args: {
    composer: { ...composer, canSubmit: false },
    strategy: {
      ...strategy,
      status: "empty",
      selected: undefined,
      strategies: [],
    },
  },
};
export const ChangingStrategy: Story = {
  args: {
    composer: { ...composer, canSubmit: false },
    strategy: { ...strategy, isLoading: true },
  },
};
export const Submitting: Story = {
  args: {
    composer: { ...composer, canSubmit: false },
    submission: { ...submission, isSubmitting: true },
  },
};
export const SubmissionFailureKeepsDraft: Story = {
  args: {
    composer: {
      ...composer,
      submit: fn<ComposerState["submit"]>().mockResolvedValue(
        "Message was not accepted. Try again.",
      ),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message" });
    mocked(args.composer.submit).mockResolvedValueOnce(
      "Message was not accepted. Try again.",
    );
    await userEvent.type(input, "Keep this draft.{Enter}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "not accepted",
    );
    await expect(input).toHaveValue("Keep this draft.");
  },
};
export const SubmissionErrorPagesWithWarnings: Story = {
  args: {
    stop: { ...stop, error: "The stop request failed." },
    composer: {
      ...composer,
      submit: fn<ComposerState["submit"]>().mockResolvedValue(undefined),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message" });
    const warningBackground = window.getComputedStyle(
      canvas.getByRole("alert").parentElement!,
    ).backgroundColor;
    mocked(args.composer.submit).mockResolvedValueOnce(
      "Input no longer pending.",
    );
    await userEvent.type(input, "Keep this reply.{Enter}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Input no longer pending.",
    );
    await expect(canvas.getAllByRole("alert")).toHaveLength(1);
    await expect(canvas.getByLabelText("Warning count")).toHaveTextContent(
      "1/2",
    );
    await expect(canvas.getByRole("alert").parentElement).toHaveAttribute(
      "data-severity",
      "error",
    );
    await expect(
      window.getComputedStyle(canvas.getByRole("alert").parentElement!)
        .backgroundColor,
    ).not.toBe(warningBackground);
    await expect(input).toHaveValue("Keep this reply.");
    await userEvent.click(canvas.getByRole("button", { name: "Next warning" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "The stop request failed.",
    );
    await expect(canvas.getByRole("alert").parentElement).toHaveAttribute(
      "data-severity",
      "warning",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous warning" }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Input no longer pending.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss all warnings" }),
    );
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(input).toHaveValue("Keep this reply.");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(input).toHaveValue("");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "The stop request failed.",
    );
    await expect(
      canvas.queryByText("Input no longer pending."),
    ).not.toBeInTheDocument();
  },
};
export const StopFailed: Story = {
  args: {
    stop: {
      ...stop,
      active: true,
      canStop: true,
      error: "The run could not be stopped.",
    },
  },
};
export const Stopping: Story = {
  args: {
    composer: { ...composer, canSubmit: false },
    stop: { ...stop, active: true, isStopping: true },
  },
};
export const ModelRoleOverrides: Story = {
  args: { modelRoles: { simple: "beta/all-rounder" } },
  play: async ({ canvasElement, args }) => {
    const socket = await openSocket();
    const subscription = await acknowledgeSubscription(
      socket,
      "core.modelRoles.watch",
    );
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "modelRoles.updated",
        data: {
          modelRoles: {
            simple: "alpha/vision-tools",
            complex: "alpha/reasoner",
          },
          defaults: [
            { name: "simple", description: "Quick tasks" },
            { name: "complex", description: "Careful reasoning" },
          ],
        },
      }),
    );
    await publishProviders(exampleProviders);
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Strategy models:/ });
    await expect(trigger).toHaveTextContent("1 overridden");
    await userEvent.click(trigger);
    const dialog = within(
      canvas.getByRole("dialog", { name: "Strategy models" }),
    );
    await expect(
      dialog.getByRole("button", { name: /^Model for @simple:/ }),
    ).toHaveTextContent("beta/all-rounder");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(args.strategy.changeModels).not.toHaveBeenCalled();
  },
};
export const MultipleWarnings: Story = {
  args: {
    strategy: { ...strategy, selected: undefined },
    stop: { ...stop, error: "The stop request failed." },
  },
};
export const AgentQuestion: Story = { args: { questions: [question] } };
export const MultipleQuestions: Story = {
  args: {
    questions: [
      {
        ...question,
        questions: [
          question.questions[0]!,
          {
            ...question.questions[0]!,
            id: "mobile",
            prompt: "Should I include the mobile layout?",
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Question count")).toHaveTextContent(
      "1/2",
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Your answer" }),
      "Start with the composer.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Next question" }),
    );
    await expect(canvas.getByLabelText("Question count")).toHaveTextContent(
      "2/2",
    );
    await expect(
      canvas.getByText("Should I include the mobile layout?"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("textbox", { name: "Your answer" }),
    ).toHaveValue("");
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous question" }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Your answer" }),
    ).toHaveValue("Start with the composer.");
  },
};
export const IndependentQuestionnaires: Story = {
  args: {
    questions: [
      question,
      { ...question, requestId: "request-reviewer", agentName: "Reviewer" },
    ],
  },
};
export const StrategySwitchQuestion: Story = {
  args: {
    questions: [
      {
        ...question,
        toolName: "request_strategy_switch",
        questions: [
          {
            id: "strategy-switch",
            prompt: "Switch to the review strategy?",
            fields: [
              {
                id: "decision",
                type: "choice",
                label: "Decision",
                required: true,
                minSelections: 1,
                maxSelections: 1,
                options: [
                  { id: "switch", label: "Switch" },
                  { id: "stay", label: "Stay" },
                ],
              },
              {
                id: "feedback",
                type: "text",
                label: "Feedback",
                required: false,
              },
            ],
          },
        ],
      },
    ],
  },
};
export const AnsweringQuestion: Story = {
  args: AgentQuestion.args,
  play: async ({ canvasElement }) => {
    await openSocket();
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Your answer" }),
      "Start with the composer.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Your answer" }),
    ).toBeDisabled();
  },
};
export const QuestionFailure: Story = {
  args: AgentQuestion.args,
  play: async ({ canvasElement }) => {
    const socket = await openSocket();
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Your answer" }),
      "Start with the composer.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await answerCommand(socket, "questions.submit", {
      type: "response",
      ok: false,
      error: { code: "ANSWER_FAILED", message: "Could not send the answer." },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Could not send the answer",
    );
  },
};
export const ContextChoice: Story = {
  args: {
    submission: { ...submission, dialog: context, isSubmitting: true },
    composer: { ...composer, canSubmit: false },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Compact" }));
    await expect(args.submission.choose).toHaveBeenCalledWith("compact");
    await userEvent.click(
      canvas.getByRole("button", { name: "Send 8 recent messages" }),
    );
    await expect(args.submission.choose).toHaveBeenCalledWith("recent");
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue with full history" }),
    );
    await expect(args.submission.choose).toHaveBeenCalledWith("full");
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.submission.cancel).toHaveBeenCalledOnce();
  },
};
export const ContextError: Story = {
  args: {
    ...ContextChoice.args,
    submission: {
      ...submission,
      isSubmitting: true,
      dialog: {
        ...context,
        error: "Compaction failed. Choose another context option.",
      },
    },
  },
};
export const ConfirmStrategySwitch: Story = {
  args: { strategy: { ...strategy, pending: { strategy: review } } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Wait" }));
    await expect(args.strategy.wait).toHaveBeenCalledOnce();
    await userEvent.click(
      canvas.getByRole("button", { name: "Stop and switch" }),
    );
    await expect(args.strategy.stopAndSwitch).toHaveBeenCalledOnce();
  },
};
export const SwitchingStrategy: Story = {
  args: {
    composer: { ...composer, canSubmit: false },
    strategy: { ...strategy, pending: { strategy: review }, isLoading: true },
  },
};
export const StrategySwitchFailed: Story = {
  args: {
    strategy: {
      ...strategy,
      pending: { strategy: review },
      error: "Could not switch strategy. Your draft is preserved.",
    },
  },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
