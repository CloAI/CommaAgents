import type { ModelOverrides, SettingsRecord } from "./settings.types";

/**
 * Validate the shape of a decoded local-storage record.
 * @param {unknown} value - Decoded browser data.
 * @returns {boolean} Whether the record has the supported shape.
 */
export function isSettingsRecord(value: unknown): value is SettingsRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "daemon" in value &&
    typeof value.daemon === "object" &&
    value.daemon !== null &&
    "url" in value.daemon &&
    typeof value.daemon.url === "string" &&
    (!("strategyPath" in value) ||
      value.strategyPath === undefined ||
      typeof value.strategyPath === "string") &&
    (!("modelOverrides" in value) ||
      value.modelOverrides === undefined ||
      isModelOverrides(value.modelOverrides))
  );
}

/**
 * Validate strategy path to agent name to model string records.
 * @param {unknown} value - Decoded browser data.
 * @returns {boolean} Whether every entry is a string-to-string record.
 */
function isModelOverrides(value: unknown): value is ModelOverrides {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (agents) =>
        typeof agents === "object" &&
        agents !== null &&
        !Array.isArray(agents) &&
        Object.values(agents).every((model) => typeof model === "string"),
    )
  );
}
