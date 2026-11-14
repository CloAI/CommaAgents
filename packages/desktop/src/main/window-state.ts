import { readDesktopConfig, updateDesktopConfig } from "./desktop-config";
import type { WindowState } from "./desktop-config";

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
 * Read the saved window placement, ignoring a missing or invalid file.
 * @param {string} file - Desktop configuration file.
 * @returns {WindowState} Saved placement or the default.
 */
export function readWindowState(file: string): WindowState {
  return readDesktopConfig(file).window ?? DEFAULT_WINDOW_STATE;
}

/**
 * Save the window placement, keeping the other saved preferences.
 * @param {string} file - Desktop configuration file.
 * @param {WindowState} state - Placement to save.
 * @returns {void}
 */
export function writeWindowState(file: string, state: WindowState): void {
  updateDesktopConfig(file, { window: state });
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
