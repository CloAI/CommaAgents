/** Raw mode check for safe `useInput` activation. */
export const RAW_MODE_SUPPORTED =
  typeof process.stdin.setRawMode === "function";
