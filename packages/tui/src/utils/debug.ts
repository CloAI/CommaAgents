import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Global debug flags for the TUI package.
 *
 * Flip these to `true` during development to enable visual debugging aids.
 * All flags MUST default to `false` — never commit with flags enabled.
 */

/** When `true`, every Ink component briefly flashes a yellow background on re-render. */
export const DEBUG_RENDER = false;

/** When `true`, all log entries are also written to {@link LOG_FILE_PATH} on disk. */
export const DEBUG_LOG = false;

/** Absolute path to the debug log file written when {@link DEBUG_LOG} is enabled. */
export const LOG_FILE_PATH = join(tmpdir(), "comma-agents-tui.log");
