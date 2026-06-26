import { describe, expect, it } from "bun:test";
import { resolveThemeByName } from ".";
import { darkTheme } from "./dark";
import { draculaTheme } from "./dracula";

describe("resolveThemeByName", () => {
  it("returns registered themes", () => {
    expect(resolveThemeByName("dracula")).toBe(draculaTheme);
  });

  it("falls back to the default for an unknown runtime value", () => {
    expect(resolveThemeByName("unknown" as "dark")).toBe(darkTheme);
  });
});
