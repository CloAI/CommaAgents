import { describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { Hide } from "./Hide";

describe("Hide", () => {
  it("renders children when neither threshold hides them", () => {
    const { lastFrame } = render(
      <Hide below={0}>
        <Text>visible</Text>
      </Hide>,
    );

    expect(lastFrame()).toBe("visible");
  });

  it("hides children below a numeric threshold", () => {
    const { lastFrame } = render(
      <Hide below={Number.MAX_SAFE_INTEGER}>
        <Text>hidden</Text>
      </Hide>,
    );

    expect(lastFrame()).toBe("");
  });

  it("hides children at or above a numeric threshold", () => {
    const { lastFrame } = render(
      <Hide above={0}>
        <Text>hidden</Text>
      </Hide>,
    );

    expect(lastFrame()).toBe("");
  });
});
