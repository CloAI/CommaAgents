import { describe, expect, it } from "bun:test";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { darkTheme } from "../../Theme";

import { ModalRender, type ModalRenderProps } from "./Modal";
import { createModalTheme } from "./Modal.theme";

describe("ModalRender", () => {
  it("should render title and children", () => {
    const { lastFrame } = renderModal(
      {
        title: "Confirm",
      },
      <Text>Are you sure?</Text>,
    );

    expect(lastFrame()).toContain("Confirm");
    expect(lastFrame()).toContain("Are you sure?");
  });

  it("should render without title", () => {
    const { lastFrame } = renderModal({}, <Text>Body content</Text>);

    expect(lastFrame()).toContain("Body content");
    expect(lastFrame()).not.toContain("undefined");
  });

  it("should render without crashing", () => {
    const result = renderModal({ title: "Test" }, <Text>Content</Text>);

    expect(result.lastFrame()).toBeDefined();
    result.cleanup();
  });
});

function renderModal(
  props: Omit<ModalRenderProps, "children" | "theme">,
  children: React.ReactNode,
) {
  return render(
    <Box width={40} height={8}>
      <ModalRender
        {...props}
        theme={createModalTheme(darkTheme)}
        width={40}
        height={8}
      >
        {children}
      </ModalRender>
    </Box>,
  );
}
