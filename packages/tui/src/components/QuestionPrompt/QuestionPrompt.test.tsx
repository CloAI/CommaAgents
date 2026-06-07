import { describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import { QuestionPrompt, QuestionPromptRender } from "./QuestionPrompt";

describe("QuestionPromptRender", () => {
  it("should render actor name and question asks text", () => {
    const onSubmit = mock(() => {});
    const onInputValueChange = mock(() => {});
    const colors = {
      primary: "cyan",
      secondary: "gray",
    };

    const { lastFrame } = render(
      <QuestionPromptRender
        actor="TestAgent"
        question="What is your favorite color?"
        inputValue="blue"
        onInputValueChange={onInputValueChange}
        onSubmit={onSubmit}
        colors={colors}
      />,
    );

    const frameText = lastFrame();
    expect(frameText).toContain("❓ Question / Feedback Request");
    expect(frameText).toContain("TestAgent");
    expect(frameText).toContain("asks:");
    expect(frameText).toContain("What is your favorite color?");
    expect(frameText).toContain("blue");
  });
});

describe("QuestionPrompt integration", () => {
  it("should render integrated QuestionPrompt container", () => {
    const onSubmit = mock(() => {});
    const request = {
      questionRequestId: "request-123",
      runId: "run-456",
      agentName: "AgentPower",
      toolName: "SearchTool",
      question: "Are you sure you want to write to this file?",
    };

    const { lastFrame } = render(
      <QuestionPrompt request={request} onSubmit={onSubmit} />,
    );

    const frameText = lastFrame();
    expect(frameText).toContain("❓ Question / Feedback Request");
    expect(frameText).toContain("AgentPower (SearchTool)");
    expect(frameText).toContain("asks:");
    expect(frameText).toContain("Are you sure you want to write to this file?");
  });

  it("should render without tool name correctly", () => {
    const onSubmit = mock(() => {});
    const request = {
      questionRequestId: "request-123",
      runId: "run-456",
      agentName: "StandaloneAgent",
      toolName: "",
      question: "Is this correct?",
    };

    const { lastFrame } = render(
      <QuestionPrompt request={request} onSubmit={onSubmit} />,
    );

    const frameText = lastFrame();
    expect(frameText).toContain("StandaloneAgent");
    expect(frameText).not.toContain("()");
  });
});
