import React from "react";
import { render } from "ink-testing-library";
import { describe, expect, it, mock } from "bun:test";

import { ChatTextAreaRender } from "./ChatTextArea";

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
    expect(lastFrame()).toContain("Break a goal into steps");
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

    expect(lastFrame()).toContain("tab");
    expect(lastFrame()).toContain("ctrl+s");
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
