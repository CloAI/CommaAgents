import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getApplicationDataDirectory } from "@comma-agents/core";
import { z } from "zod/v4";

const WindowStateSchema = z.object({
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().min(400),
  height: z.number().int().min(300),
  maximized: z.boolean(),
});
const DesktopConfigSchema = z.object({
  version: z.literal(1),
  window: WindowStateSchema.optional(),
});

/** Saved window placement. */
type WindowState = z.infer<typeof WindowStateSchema>;

/** A rectangle in screen coordinates. */
interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Window size used when nothing valid was saved. */
export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1280,
  height: 800,
  maximized: false,
};

/** Smallest part of the window, in each direction, that must stay on a display. */
const MINIMUM_VISIBLE = 100;

/**
 * Locate the desktop configuration file beside the daemon's configuration.
 * @returns {string} Path of `desktop.json` in the application data directory.
 */
export function desktopConfigFile(): string {
  return join(getApplicationDataDirectory(), "desktop.json");
}

/**
 * Read the saved window placement, ignoring a missing or invalid file.
 * @param {string} file - Desktop configuration file.
 * @returns {WindowState} Saved placement or the default.
 */
export function readWindowState(file: string): WindowState {
  try {
    const config = DesktopConfigSchema.parse(
      JSON.parse(readFileSync(file, "utf8")),
    );
    return config.window ?? DEFAULT_WINDOW_STATE;
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

/**
 * Save the window placement atomically.
 * @param {string} file - Desktop configuration file.
 * @param {WindowState} state - Placement to save.
 * @returns {void}
 */
export function writeWindowState(file: string, state: WindowState): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    JSON.stringify({ version: 1, window: state }, null, 2),
  );
  renameSync(temporary, file);
}

/**
 * Keep a saved placement usable after displays change.
 * @param {WindowState} state - Saved placement.
 * @param {readonly Rectangle[]} workAreas - Usable area of each connected display.
 * @returns {WindowState} The placement, without a position when it would be off-screen.
 */
export function fitToDisplays(
  state: WindowState,
  workAreas: readonly Rectangle[],
): WindowState {
  const { x, y } = state;
  if (x === undefined || y === undefined) {
    return state;
  }
  const visible = workAreas.some(
    (area) =>
      Math.min(x + state.width, area.x + area.width) - Math.max(x, area.x) >=
        MINIMUM_VISIBLE &&
      Math.min(y + state.height, area.y + area.height) - Math.max(y, area.y) >=
        MINIMUM_VISIBLE,
  );
  return visible ? state : { ...state, x: undefined, y: undefined };
}
