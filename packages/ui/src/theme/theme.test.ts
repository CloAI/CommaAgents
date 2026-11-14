import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMES } from "./presets";
import { THEME_COLOR_FIELDS } from "./theme.constants";
import { THEME_COLOR_KEYS } from "./theme.types";
import {
  activeTheme,
  cloneTheme,
  isAppearanceSettings,
  isHexColor,
  isThemePalette,
  themeCssVariables,
} from "./theme.utils";

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort(
    (x, y) => y - x,
  );
  return (light + 0.05) / (dark + 0.05);
}

describe("themes", () => {
  it("should keep text, muted text, and accents readable in every theme and mode", () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const [mode, p] of [
        ["dark", theme.dark],
        ["light", theme.light],
      ] as const) {
        const label = `${theme.name} ${mode}`;
        for (const bg of [p.canvas, p.surface, p.surfaceRaised]) {
          expect(contrast(p.text, bg), `${label} text`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
        expect(
          contrast(p.muted, p.canvas),
          `${label} muted`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(p.primary, p.canvas),
          `${label} primary`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(p.onPrimary, p.primary),
          `${label} onPrimary`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(p.onWarning, p.warning),
          `${label} onWarning`,
        ).toBeGreaterThanOrEqual(4.5);
        for (const key of [
          "keyword",
          "string",
          "number",
          "function",
          "attribute",
          "type",
          "variable",
          "tag",
          "operator",
          "meta",
        ] as const) {
          expect(
            contrast(p[key], p.codeBackground),
            `${label} ${key}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        expect(
          contrast(p.comment, p.codeBackground),
          `${label} comment`,
        ).toBeGreaterThanOrEqual(3.5);
      }
    }
  });

  it("should ship Comma first with every requested theme", () => {
    expect(BUILT_IN_THEMES.map((theme) => theme.name)).toEqual([
      "Comma",
      "Catppuccin",
      "Tokyo Night",
      "Dracula",
      "Night Owl",
      "Matcha",
      "Solarized",
      "Monokai",
    ]);
  });

  it("should give every built-in theme complete, valid palettes in both modes", () => {
    for (const theme of BUILT_IN_THEMES) {
      expect(isThemePalette(theme.dark), `${theme.name} dark`).toBe(true);
      expect(isThemePalette(theme.light), `${theme.name} light`).toBe(true);
    }
  });

  it("should keep Comma dark identical to the original defaults", () => {
    const [comma] = BUILT_IN_THEMES;
    expect(comma?.dark.canvas).toBe("#0b090f");
    expect(comma?.dark.primary).toBe("#d0bcff");
  });

  it("should expose every color under a unique CSS variable plus a base copy", () => {
    const variables = themeCssVariables(BUILT_IN_THEMES[0]!.dark);
    expect(Object.keys(variables)).toHaveLength(THEME_COLOR_KEYS.length * 2);
    expect(variables["--color-canvas"]).toBe("#0b090f");
    expect(variables["--base-color-canvas"]).toBe("#0b090f");
    expect(
      new Set(Object.values(THEME_COLOR_FIELDS).map((f) => f.cssVariable)).size,
    ).toBe(THEME_COLOR_KEYS.length);
  });

  it("should accept only six-digit hex colors", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    for (const bad of ["#abc", "a1b2c3", "#a1b2c3d", "red"]) {
      expect(isHexColor(bad)).toBe(false);
    }
  });

  it("should fall back to Comma when the selected theme was deleted", () => {
    expect(
      activeTheme({ themeId: "custom-gone", mode: "dark", customThemes: [] })
        .id,
    ).toBe("comma");
  });

  it("should accept System as a saved mode", () => {
    expect(
      isAppearanceSettings({
        themeId: "comma",
        mode: "system",
        customThemes: [],
      }),
    ).toBe(true);
  });

  it("should validate saved appearance including custom themes", () => {
    const custom = cloneTheme(BUILT_IN_THEMES[1]!, "custom-1", "Mine");
    expect(
      isAppearanceSettings({
        themeId: "custom-1",
        mode: "light",
        customThemes: [custom],
      }),
    ).toBe(true);
    expect(
      isAppearanceSettings({
        themeId: "x",
        mode: "dark",
        customThemes: [{ ...custom, dark: { ...custom.dark, text: "nope" } }],
      }),
    ).toBe(false);
    expect(
      isAppearanceSettings({ themeId: "x", mode: "sepia", customThemes: [] }),
    ).toBe(false);
  });
});
