import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { SystemMessage } from "./SystemMessage";

describe("SystemMessage", () => {
  it("renders a readable system panel snapshot", () => {
    const { lastFrame } = render(
      <SystemMessage text="Strategy preparation completed." />,
      { columns: 50 },
    );

    expect(lastFrame()).toContain("system");
    expect(lastFrame()).toContain("Strategy preparation completed.");
    expect(lastFrame()).toMatchSnapshot();
  });
});
