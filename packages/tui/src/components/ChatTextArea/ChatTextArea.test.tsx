import { describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";

import { ChatTextArea, ChatTextAreaRender } from "./ChatTextArea";

describe("ChatTextAreaRender", () => {
  it("should display the strategy label and description", () => {
    const { lastFrame } = render(
      <ChatTextAreaRender
        inputValue=""
        onInputChange={mock()}
        onSubmit={mock()}
        strategyLabel="Plan"
        strategyDescription="Break a goal into steps"
        width={60}
        height={3}
        placeholder="Enter your prompt..."
        showStrategyRow={true}
      />,
    );

    expect(lastFrame()).toContain("Plan");
    expect(lastFrame()).toContain("Tab to change strategy");
  });

  it("should display keybinding hints", () => {
    const { lastFrame } = render(
      <ChatTextAreaRender
        inputValue=""
        onInputChange={mock()}
        onSubmit={mock()}
        strategyLabel="Plan"
        strategyDescription="Break a goal into steps"
        width={60}
        height={3}
        placeholder="Enter your prompt..."
        showStrategyRow={true}
      />,
    );

    expect(lastFrame()).toContain("Tab");
    expect(lastFrame()).toContain("Enter");
  });

  it("should display placeholder when input is empty", () => {
    const { lastFrame } = render(
      <ChatTextAreaRender
        inputValue=""
        onInputChange={mock()}
        onSubmit={mock()}
        strategyLabel="Plan"
        strategyDescription="Break a goal into steps"
        width={60}
        height={3}
        placeholder="Type something..."
        showStrategyRow={true}
      />,
    );

    expect(lastFrame()).toContain("Type something...");
  });

  it("should hide the strategy row when showStrategyRow is false", () => {
    const { lastFrame } = render(
      <ChatTextAreaRender
        inputValue=""
        onInputChange={mock()}
        onSubmit={mock()}
        strategyLabel="Plan"
        strategyDescription="Break a goal into steps"
        width={60}
        height={3}
        placeholder="Steer the agents..."
        showStrategyRow={false}
      />,
    );

    expect(lastFrame()).not.toContain("Tab to change strategy");
    expect(lastFrame()).not.toContain("Break a goal into");
  });

  it("should match snapshot for default state", () => {
    const { lastFrame } = render(
      <ChatTextAreaRender
        inputValue=""
        onInputChange={mock()}
        onSubmit={mock()}
        strategyLabel="Build"
        strategyDescription="Describe what to build"
        width={60}
        height={3}
        placeholder="Enter your prompt..."
        showStrategyRow={true}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});

describe("ChatTextArea", () => {
  it("should render Loading when strategies is empty", () => {
    const { lastFrame } = render(
      <ChatTextArea
        strategies={[]}
        onSubmit={mock()}
        id="chat"
        width={60}
        height={3}
      />,
    );

    expect(lastFrame()).toContain("Loading...");
    expect(lastFrame()).toContain("Tab to change strategy");
  });

  it("selects the active strategy before allowing continuation changes", () => {
    const { lastFrame } = render(
      <ChatTextArea
        strategies={[
          {
            name: "build",
            version: "1.0",
            path: "/build.json",
            origin: "cwd",
            label: "Build",
          },
          {
            name: "plan",
            version: "1.0",
            path: "/plan.json",
            origin: "cwd",
            label: "Plan",
          },
        ]}
        initialStrategyPath="/plan.json"
        onSubmit={mock()}
        id="chat"
        width={60}
        height={3}
      />,
    );

    expect(lastFrame()).toContain("Plan");
  });
});
