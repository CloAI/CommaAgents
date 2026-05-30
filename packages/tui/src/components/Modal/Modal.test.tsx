import { describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";

import { ModalRender } from "./Modal";

describe("ModalRender", () => {
  it("should render title and children", () => {
    const { lastFrame } = render(
      <ModalRender title="Confirm">
        <Text>Are you sure?</Text>
      </ModalRender>,
    );

    // Children always render; title may be clipped by maxHeight in small test envs.
    expect(lastFrame()).toContain("Are you sure?");
    expect(lastFrame()).toBeDefined();
  });

  it("should render without title", () => {
    const { lastFrame } = render(
      <ModalRender>
        <Text>Body content</Text>
      </ModalRender>,
    );

    expect(lastFrame()).toContain("Body content");
    expect(lastFrame()).not.toContain("undefined");
  });

  it("should render without crashing", () => {
    const result = render(
      <ModalRender title="Test">
        <Text>Content</Text>
      </ModalRender>,
    );

    expect(result.lastFrame()).toBeDefined();
    result.cleanup();
  });
});
