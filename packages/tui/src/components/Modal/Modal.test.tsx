import { describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";

import { ModalContentRender, ModalRender } from "./Modal";
import type { ModalTheme } from "./Modal.theme";

/**
 * ModalRender uses position:"absolute" for the backdrop, which ink-testing-library
 * does not render into the visible text buffer. Tests verify the component renders
 * without errors rather than asserting on visible text content.
 *
 * ModalContentRender is the bordered box component without backdrop — use it for
 * assertions on visible text.
 */
const TEST_THEME: ModalTheme = {
  backdrop: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
  },
  content: {
    flexDirection: "column",
    borderStyle: "single",
    borderColor: "gray",
    paddingX: 1,
    paddingY: 1,
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: "#000000",
  },
  title: {
    bold: true,
    color: "cyan",
  },
};

describe("ModalRender", () => {
  it("should render with percentage sizes without crashing", () => {
    const result = render(
      <ModalRender theme={TEST_THEME} title="Confirm" width="80%" height="80%">
        <Text>Are you sure?</Text>
      </ModalRender>,
    );

    expect(result.lastFrame()).toBeDefined();
    result.cleanup();
  });

  it("should render with fixed sizes without crashing", () => {
    const result = render(
      <ModalRender theme={TEST_THEME} width={40} height={10}>
        <Text>Body content</Text>
      </ModalRender>,
    );

    expect(result.lastFrame()).toBeDefined();
    result.cleanup();
  });
});

describe("ModalContentRender", () => {
  it("should render title and children", () => {
    const { lastFrame } = render(
      <ModalContentRender theme={TEST_THEME} title="Confirm" contentWidth={40}>
        <Text>Are you sure?</Text>
      </ModalContentRender>,
    );

    expect(lastFrame()).toContain("Confirm");
    expect(lastFrame()).toContain("Are you sure?");
  });

  it("should render without title", () => {
    const { lastFrame } = render(
      <ModalContentRender theme={TEST_THEME} contentWidth={40}>
        <Text>Body content</Text>
      </ModalContentRender>,
    );

    expect(lastFrame()).toContain("Body content");
    expect(lastFrame()).not.toContain("undefined");
  });

  it("should render with custom dimensions", () => {
    const result = render(
      <ModalContentRender
        theme={TEST_THEME}
        contentWidth={20}
        contentHeight={5}
      >
        <Text>Small modal</Text>
      </ModalContentRender>,
    );

    expect(result.lastFrame()).toBeDefined();
    result.cleanup();
  });
});
