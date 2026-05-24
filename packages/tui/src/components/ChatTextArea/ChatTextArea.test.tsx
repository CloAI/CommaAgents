import { describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";

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
      />,
    );

    expect(lastFrame()).toContain("Plan");
    expect(lastFrame()).toContain("Break a goal into");
    expect(lastFrame()).toContain("steps");
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
      />,
    );

    expect(lastFrame()).toContain("Type something...");
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
    expect(lastFrame()).toContain("available strategies...");
  });
});
