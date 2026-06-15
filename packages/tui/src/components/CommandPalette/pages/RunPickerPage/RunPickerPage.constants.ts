/** Modal id shared with App.tsx - must stay in sync. */
export const COMMAND_PALETTE_MODAL_ID = "command-palette";

export const RAW_MODE_SUPPORTED =
  typeof process.stdin.setRawMode === "function";
