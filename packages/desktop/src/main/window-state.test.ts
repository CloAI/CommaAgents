import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOW_STATE,
  fitToDisplays,
  readWindowState,
  writeWindowState,
} from "./window-state";

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe("fitToDisplays", () => {
  it("keeps a position that is visible", () => {
    const state = { x: 100, y: 80, width: 800, height: 600, maximized: false };
    expect(fitToDisplays(state, [display])).toEqual(state);
  });

  it("drops a position left on a disconnected display", () => {
    const state = { x: 3000, y: 100, width: 800, height: 600, maximized: true };
    expect(fitToDisplays(state, [display])).toEqual({
      ...state,
      x: undefined,
      y: undefined,
    });
  });

  it("keeps a position visible on a second display", () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    const state = {
      x: 2500,
      y: 100,
      width: 800,
      height: 600,
      maximized: false,
    };
    expect(fitToDisplays(state, [display, second])).toEqual(state);
  });

  it("passes through a state without a position", () => {
    expect(fitToDisplays(DEFAULT_WINDOW_STATE, [display])).toEqual(
      DEFAULT_WINDOW_STATE,
    );
  });
});

describe("window state file", () => {
  const file = () =>
    join(mkdtempSync(join(tmpdir(), "comma-desktop-")), "a", "desktop.json");

  it("round-trips saved placement in the versioned file", () => {
    const path = file();
    const state = { x: 10, y: 20, width: 900, height: 700, maximized: true };
    writeWindowState(path, state);

    expect(readWindowState(path)).toEqual(state);
    expect(JSON.parse(readFileSync(path, "utf8")).version).toBe(1);
  });

  it("falls back to the default for a missing or invalid file", () => {
    const path = file();
    expect(readWindowState(path)).toEqual(DEFAULT_WINDOW_STATE);

    writeWindowState(path, DEFAULT_WINDOW_STATE);
    writeFileSync(path, '{"version":1,"window":{"width":10}}');
    expect(readWindowState(path)).toEqual(DEFAULT_WINDOW_STATE);
  });
});
