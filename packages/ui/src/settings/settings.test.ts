import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMA_THEME } from "../theme/presets";
import { cloneTheme } from "../theme";
import { loadSettings, saveSettings } from "./settings";

const records = new Map<string, string>();
afterEach(() => {
  vi.unstubAllGlobals();
  records.clear();
});

describe("settings", () => {
  it("should preserve model configurations and per-pane colors through a browser reload", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => {
          records.set(key, value);
        },
      },
    });
    const settings = {
      daemon: { url: "ws://localhost:7422/ws" },
      modelRolePresets: { "My models": { simple: "openai/gpt-5-mini" } },
      paneHues: { "pane-1": 120, "pane-2": 300 },
    };
    expect(saveSettings(settings).type).toBe("success");
    expect(loadSettings()).toEqual({ settings, notice: null });
  });

  it("should preserve the selected theme, mode, and custom themes", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => records.get(key) ?? null,
        setItem: (key: string, value: string) => {
          records.set(key, value);
        },
      },
    });
    const custom = cloneTheme(COMMA_THEME, "custom-1", "Mine");
    const settings = {
      daemon: { url: "ws://localhost:7422/ws" },
      appearance: {
        themeId: "custom-1",
        mode: "light" as const,
        customThemes: [custom],
      },
    };
    expect(saveSettings(settings).type).toBe("success");
    expect(loadSettings()).toEqual({ settings, notice: null });
  });

  it("should reject malformed saved colors and configurations", () => {
    for (const invalid of [
      { paneHues: { pane: 361 } },
      { paneHues: { pane: "red" } },
      { modelRolePresets: { invalid: { simple: 42 } } },
    ]) {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: () =>
            JSON.stringify({
              version: 1,
              daemon: { url: "ws://localhost:7422/ws" },
              ...invalid,
            }),
        },
      });
      expect(loadSettings().notice).toContain("invalid");
    }
  });
});
