export const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

export const CREDENTIAL_TYPE_LABELS: Readonly<Record<string, string>> = {
  api: "API Key",
  oauth: "OAuth",
  custom: "Custom",
  none: "local",
};

export const UNPRINTABLE_KEYS = new Set([
  "upArrow",
  "downArrow",
  "leftArrow",
  "rightArrow",
  "escape",
  "return",
  "tab",
  "delete",
  "backspace",
  "pageUp",
  "pageDown",
  "home",
  "end",
]);
