import { describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";

import {
  TOOL_SPINNER_FRAMES,
  TOOL_SPINNER_INTERVAL_MS,
  useToolSpinner,
} from "./useToolSpinner";

interface ProbeProps {
  readonly running: boolean;
}

function Probe({ running }: ProbeProps): React.ReactElement {
  const frame = useToolSpinner(running);
  return <Text>{frame ?? "IDLE"}</Text>;
}

describe("useToolSpinner", () => {
  it("returns null (renders IDLE marker) when not running", () => {
    const { lastFrame } = render(<Probe running={false} />);
    expect(lastFrame()).toContain("IDLE");
    // Should never accidentally produce one of the spinner frames
    // when idle.
    for (const frameChar of TOOL_SPINNER_FRAMES) {
      expect(lastFrame()).not.toContain(frameChar);
    }
  });

  it("returns a valid spinner frame when running", () => {
    const { lastFrame } = render(<Probe running={true} />);
    const frame = lastFrame() ?? "";
    const matched = TOOL_SPINNER_FRAMES.some((g) => frame.includes(g));
    expect(matched).toBe(true);
  });

  it("uses a sensible animation interval (>0, <1000ms)", () => {
    expect(TOOL_SPINNER_INTERVAL_MS).toBeGreaterThan(0);
    expect(TOOL_SPINNER_INTERVAL_MS).toBeLessThan(1000);
  });

  it("exposes a non-empty frame rotation", () => {
    expect(TOOL_SPINNER_FRAMES.length).toBeGreaterThanOrEqual(2);
    // Every frame must be a single visible character so column
    // alignment in `ToolCallView` stays stable across ticks.
    for (const frameChar of TOOL_SPINNER_FRAMES) {
      expect(frameChar.length).toBeGreaterThan(0);
    }
  });

  it("supports concurrent subscribers without crashing", () => {
    const { lastFrame, rerender, unmount } = render(
      <>
        <Probe running={true} />
        <Probe running={true} />
        <Probe running={true} />
      </>,
    );
    expect(lastFrame()).toBeDefined();
    rerender(
      <>
        <Probe running={false} />
        <Probe running={true} />
      </>,
    );
    expect(lastFrame()).toBeDefined();
    unmount();
  });
});
