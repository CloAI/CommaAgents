import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import type { QuestionCollectionRenderProps } from "./QuestionCollection";
import { usePendingQuestions } from "../../hooks/usePendingQuestions";
import type { PendingQuestion } from "../../hooks/usePendingQuestions";
import { MockWebSocket } from "../../hooks/useWebSocket/test.utils";
import { AppProviders, openSocket, prepareStory } from "../../test.utils";
import {
  answerCommand,
  acknowledgeSubscription,
  deliver,
  requests,
} from "../../hooks/useCommaAgentsDaemon/test.utils";
import {
  QuestionCollection,
  QuestionCollectionRender,
} from "./QuestionCollection";

const request: PendingQuestion = {
  runId: "run-question",
  requestId: "questionnaire-1",
  agentName: "Researcher",
  toolName: "ask_questions",
  ts: "2026-11-12T12:00:00Z",
  questions: [
    {
      id: "scope",
      prompt: "Which package should I review first?",
      fields: [
        { id: "answer", type: "text", label: "Package", required: true },
      ],
    },
    {
      id: "layout",
      prompt: "Which layouts should I include?",
      fields: [
        { id: "answer", type: "text", label: "Layouts", required: true },
      ],
    },
  ],
};
const meta = {
  title: "Components/QuestionCollection",
  component: QuestionCollectionRender,
  args: {
    request,
    busy: false,
    onSubmit: fn<QuestionCollectionRenderProps["onSubmit"]>().mockResolvedValue(
      [],
    ),
  },
} satisfies Meta<typeof QuestionCollectionRender>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const TextQuestionnaire: Story = {
  play: async ({ canvasElement, args }) => {
    mocked(args.onSubmit).mockResolvedValue([]);
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Question count")).toHaveTextContent(
      "1/2",
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Package" }),
      "  UI first.\nThen daemon.  ",
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Next question" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Layouts" }),
      "Mobile and desktop.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous question" }),
    );
    await expect(canvas.getByRole("textbox", { name: "Package" })).toHaveValue(
      "  UI first.\nThen daemon.  ",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      answers: [
        {
          questionId: "scope",
          type: "answered",
          values: { answer: "  UI first.\nThen daemon.  " },
        },
        {
          questionId: "layout",
          type: "answered",
          values: { answer: "Mobile and desktop." },
        },
      ],
    });
  },
};

export const MixedFields: Story = {
  args: {
    request: {
      ...request,
      questions: [
        {
          id: "review",
          prompt: "Configure the review.",
          recommendation: "Start with the daemon.",
          fields: [
            {
              id: "notes",
              type: "text",
              label: "Notes",
              required: true,
              recommendation: {
                value: "Review cancellation.",
                explanation: "The lifecycle changed.",
              },
            },
            {
              id: "package",
              type: "choice",
              label: "Package",
              required: true,
              minSelections: 1,
              maxSelections: 1,
              options: [
                { id: "core", label: "Core" },
                { id: "daemon", label: "Daemon" },
              ],
              recommendation: {
                value: ["daemon"],
                explanation: "It owns the pending requests.",
              },
            },
            {
              id: "confidence",
              type: "slider",
              label: "Confidence",
              required: true,
              min: 0,
              max: 100,
              step: 5,
              minLabel: "Unsure",
              maxLabel: "Certain",
            },
          ],
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    mocked(args.onSubmit).mockResolvedValue([]);
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("textbox", { name: "Notes" }),
    ).toHaveAttribute("placeholder", "Review cancellation.");
    await expect(canvas.getByRole("textbox", { name: "Notes" })).toHaveValue(
      "",
    );
    await expect(
      canvas.getByRole("radio", { name: /Daemon/ }),
    ).not.toBeChecked();
    await expect(canvas.getByLabelText("Confidence value")).toHaveTextContent(
      "Not answered",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Use recommendation for Notes" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Use recommendation for Package" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Use displayed value" }),
    );
    await expect(canvas.getByRole("radio", { name: /Daemon/ })).toBeChecked();
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      answers: [
        {
          questionId: "review",
          type: "answered",
          values: {
            notes: "Review cancellation.",
            package: ["daemon"],
            confidence: 0,
          },
        },
      ],
    });
  },
};

export const MultipleChoice: Story = {
  args: {
    request: {
      ...request,
      questions: [
        {
          id: "areas",
          prompt: "Choose review areas.",
          fields: [
            {
              id: "areas",
              label: "Areas",
              type: "choice",
              required: true,
              minSelections: 1,
              maxSelections: 2,
              options: [
                { id: "core", label: "Core" },
                { id: "daemon", label: "Daemon" },
              ],
            },
          ],
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    mocked(args.onSubmit).mockResolvedValue([]);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Core" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Daemon" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      answers: [
        {
          questionId: "areas",
          type: "answered",
          values: { areas: ["core", "daemon"] },
        },
      ],
    });
  },
};

export const OtherAndSkip: Story = {
  play: async ({ canvasElement, args }) => {
    mocked(args.onSubmit).mockResolvedValue([]);
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Package" }),
      "Retained field draft.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Other" }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Other answer" }),
      "Only deployment scripts.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Answer fields" }),
    );
    await expect(canvas.getByRole("textbox", { name: "Package" })).toHaveValue(
      "Retained field draft.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Other" }));
    await expect(
      canvas.getByRole("textbox", { name: "Other answer" }),
    ).toHaveValue("Only deployment scripts.");
    await userEvent.click(
      canvas.getByRole("button", { name: "Next question" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Skip question" }),
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      answers: [
        {
          questionId: "scope",
          type: "other",
          text: "Only deployment scripts.",
        },
        { questionId: "layout", type: "skipped" },
      ],
    });
  },
};

export const InvalidAnswers: Story = {
  args: {
    onSubmit: fn<QuestionCollectionRenderProps["onSubmit"]>().mockResolvedValue(
      [{ questionId: "scope", fieldId: "answer", message: "Enter an answer." }],
    ),
  },
  play: async ({ canvasElement, args }) => {
    mocked(args.onSubmit).mockResolvedValue([
      { questionId: "scope", fieldId: "answer", message: "Enter an answer." },
    ]);
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Next question" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(canvas.getByLabelText("Question count")).toHaveTextContent(
      "1/2",
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Package: Enter an answer.",
    );
    await expect(
      canvas.getByRole("button", { name: "Submit answers" }),
    ).toBeEnabled();
  },
};

export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox")).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Submitting..." }),
    ).toBeDisabled();
  },
};
export const FailedSubmission: Story = {
  args: { error: "Could not submit answers. Try again." },
};
export const Empty: Story = {
  args: { request: { ...request, questions: [] } },
};
export const Narrow: Story = {
  args: MixedFields.args,
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};

export const FailureAndRetry: Story = {
  beforeEach: () => prepareStory(),
  render: () => (
    <AppProviders>
      <QuestionCollection
        questions={[{ ...request, questions: [request.questions[0]!] }]}
      />
    </AppProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Package" }),
      "Keep this answer.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    const first = await answerCommand(socket, "questions.submit", {
      type: "response",
      ok: false,
      error: { code: "RETRY", message: "Connection interrupted. Try again." },
    });
    await expect(canvas.getByRole("alert")).toHaveTextContent("interrupted");
    await expect(canvas.getByRole("textbox")).toHaveValue("Keep this answer.");
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await waitFor(() => expect(requests(socket, "command")).toHaveLength(2));
    const second = await answerCommand(socket, "questions.submit", {
      type: "response",
      ok: true,
      data: { accepted: true, replayed: true },
    });
    await expect(second.arguments).toEqual(first.arguments);
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Answers submitted.",
    );
  },
};

export const ClientValidation: Story = {
  beforeEach: () => prepareStory(),
  render: () => (
    <AppProviders>
      <QuestionCollection questions={[request]} />
    </AppProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = await openSocket();
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Package: Answer this field.",
    );
    await expect(requests(socket, "command")).toHaveLength(0);
    await userEvent.click(canvas.getByRole("button", { name: "Other" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Enter an alternative answer.",
    );
    await expect(requests(socket, "command")).toHaveLength(0);
    await userEvent.click(
      canvas.getByRole("button", { name: "Skip question" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Next question" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Skip question" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    const command = await answerCommand(socket, "questions.submit", {
      type: "response",
      ok: true,
      data: { accepted: true, replayed: false },
    });
    await expect(command.arguments?.response).toEqual({
      answers: [
        { questionId: "scope", type: "skipped" },
        { questionId: "layout", type: "skipped" },
      ],
    });
  },
};

export const ZeroSelection: Story = {
  args: {
    request: {
      ...request,
      questions: [
        {
          id: "optional-choice",
          prompt: "Choose zero or one.",
          fields: [
            {
              id: "selection",
              type: "choice",
              label: "Selection",
              required: true,
              minSelections: 0,
              maxSelections: 1,
              options: [{ id: "a", label: "A" }],
            },
          ],
        },
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    mocked(args.onSubmit).mockResolvedValue([]);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "A" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Select none for Selection" }),
    );
    await expect(canvas.getByRole("radio", { name: "A" })).not.toBeChecked();
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit answers" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      answers: [
        {
          questionId: "optional-choice",
          type: "answered",
          values: { selection: [] },
        },
      ],
    });
  },
};

export const IndependentRequests: Story = {
  beforeEach: () => prepareStory(),
  render: () => (
    <AppProviders>
      <QuestionCollection
        questions={["First", "Second"].map((agentName) => ({
          ...request,
          agentName,
          requestId: agentName,
          questions: [
            {
              id: "choice",
              prompt: "Choose",
              fields: [
                {
                  id: "choice",
                  type: "choice",
                  label: "Choice",
                  required: true,
                  minSelections: 1,
                  maxSelections: 1,
                  options: [
                    { id: "a", label: "A" },
                    { id: "b", label: "B" },
                  ],
                },
              ],
            },
          ],
        }))}
      />
    </AppProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = within(
      canvas.getByRole("region", { name: "Questions from First" }),
    );
    const second = within(
      canvas.getByRole("region", { name: "Questions from Second" }),
    );
    await userEvent.click(first.getByRole("radio", { name: "A" }));
    await userEvent.click(second.getByRole("radio", { name: "B" }));
    await expect(first.getByRole("radio", { name: "A" })).toBeChecked();
    await expect(second.getByRole("radio", { name: "B" })).toBeChecked();
  },
};

/** Render questionnaires from their real channel projection.
 * @returns {React.ReactElement} Requests followed through the daemon subscription.
 */
function WatchedQuestions() {
  const questions = usePendingQuestions("run-question");
  return <QuestionCollection questions={questions} />;
}

export const ReconnectSnapshot: Story = {
  beforeEach: () => prepareStory(),
  render: () => (
    <AppProviders>
      <WatchedQuestions />
    </AppProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = await openSocket();
    const subscription = await acknowledgeSubscription(
      first,
      "questions.watch",
    );
    const stale = {
      ...request,
      requestId: "resolved-offline",
      agentName: "Resolved agent",
    };
    await act(() =>
      deliver(first, subscription.requestId, {
        type: "questions.snapshot",
        data: { requests: [request, stale] },
      }),
    );
    const pending = within(
      canvas.getByRole("region", { name: "Questions from Researcher" }),
    );
    const input = pending.getByRole("textbox", { name: "Package" });
    await userEvent.type(input, "Keep this draft through reconnect.");
    await act(() => {
      first.close();
      first.onclose?.(new CloseEvent("close", { code: 1006 }));
    });
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(2), {
      timeout: 5000,
    });
    const second = await openSocket();
    const reopened = await acknowledgeSubscription(second, "questions.watch");
    await act(() =>
      deliver(second, reopened.requestId, {
        type: "questions.snapshot",
        data: { requests: [{ ...request }] },
      }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Questions from Resolved agent" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Package" })).toBe(input);
    await expect(input).toHaveValue("Keep this draft through reconnect.");
    await act(() =>
      deliver(second, reopened.requestId, {
        type: "questions.snapshot",
        data: { requests: [] },
      }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Questions from Researcher" }),
    ).not.toBeInTheDocument();
  },
};
