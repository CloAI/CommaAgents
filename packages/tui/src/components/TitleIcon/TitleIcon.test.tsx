import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { TitleIcon } from "./TitleIcon";

describe("TitleIcon", () => {
  it("renders a stable paused frame", () => {
    const { lastFrame } = render(<TitleIcon playing={false} />);

    expect(lastFrame()?.trim().length).toBeGreaterThan(0);
    expect(lastFrame()).toMatchSnapshot();
  });
});
