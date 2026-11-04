import { describe, expect, it } from "vitest";
import { ACCENT_LIGHTNESS, ACCENT_SATURATION } from "./RunSection.constants";
import {
  agentColor,
  formatDuration,
  formatTokens,
  tokenBreakdown,
} from "./RunSection.utils";

const SURFACE_LUMINANCE = 0.0061;

function luminance(hue: number): number {
  const saturation = ACCENT_SATURATION / 100;
  const lightness = ACCENT_LIGHTNESS / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channels = [0, 8, 4].map((offset) => {
    const position = (offset + hue / 30) % 12;
    const value =
      lightness -
      chroma * Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

describe("agentColor", () => {
  it("should give the same agent the same color", () => {
    expect(agentColor("planner")).toBe(agentColor("planner"));
  });

  it("should give different agents different colors", () => {
    expect(agentColor("planner")).not.toBe(agentColor("reviewer"));
  });

  it("should produce an hsl color", () => {
    expect(agentColor("planner")).toMatch(/^hsl\(\d{1,3} 55% 70%\)$/);
  });

  it("should stay readable on the surface color for every hue", () => {
    for (let hue = 0; hue < 360; hue++) {
      expect(
        (luminance(hue) + 0.05) / (SURFACE_LUMINANCE + 0.05),
      ).toBeGreaterThan(4.5);
    }
  });
});

describe("formatDuration", () => {
  it("should write short times in milliseconds", () => {
    expect(formatDuration(850)).toBe("850ms");
  });

  it("should write seconds with one decimal", () => {
    expect(formatDuration(1840)).toBe("1.8s");
  });

  it("should write minutes with padded seconds", () => {
    expect(formatDuration(125_000)).toBe("2m 05s");
  });
});

describe("formatTokens", () => {
  it("should separate thousands below ten thousand", () => {
    expect(formatTokens(1204)).toBe("1,204");
  });

  it("should shorten ten thousand and above", () => {
    expect(formatTokens(12_340)).toBe("12.3k");
  });
});

describe("tokenBreakdown", () => {
  it("should list input and output tokens", () => {
    expect(
      tokenBreakdown({ promptTokens: 900, completionTokens: 304 }, undefined),
    ).toBe("Input: 900\nOutput: 304");
  });

  it("should add cached tokens when reported", () => {
    expect(
      tokenBreakdown(
        { promptTokens: 900, completionTokens: 304 },
        { totalTokens: 1204, inputTokenDetails: { cacheReadTokens: 512 } },
      ),
    ).toBe("Input: 900\nOutput: 304\nCached: 512");
  });
});
