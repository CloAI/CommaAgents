import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { Button } from "./Button";

describe("Button", () => {
  it.each([
    ["primary", "Confirm"],
    ["secondary", "Details"],
    ["danger", "Delete"],
    ["ghost", "Cancel"],
  ] as const)("renders a clear %s snapshot", (variant, label) => {
    const { lastFrame } = render(
      <Button label={label} variant={variant} onPress={() => {}} />,
    );

    expect(lastFrame()).toContain(label);
    expect(lastFrame()).toMatchSnapshot();
  });

  it("renders the disabled state", () => {
    const { lastFrame } = render(
      <Button label="Locked" disabled onPress={() => {}} />,
    );

    expect(lastFrame()).toContain("[ Locked ]");
    expect(lastFrame()).toMatchSnapshot();
  });
});
