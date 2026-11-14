import { isAppearanceSettings } from "../theme";
import type { SettingsRecord, StrategyModelRoles } from "./settings.types";

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
    (!("strategyModelRoles" in value) ||
      value.strategyModelRoles === undefined ||
      isStrategyModelRoles(value.strategyModelRoles)) &&
    (!("modelRolePresets" in value) ||
      value.modelRolePresets === undefined ||
      isStrategyModelRoles(value.modelRolePresets)) &&
    (!("appearance" in value) ||
      value.appearance === undefined ||
      isAppearanceSettings(value.appearance)) &&
    (!("paneHues" in value) ||
      value.paneHues === undefined ||
      (typeof value.paneHues === "object" &&
        value.paneHues !== null &&
        !Array.isArray(value.paneHues) &&
        Object.values(value.paneHues).every(
          (hue) =>
            typeof hue === "number" &&
            Number.isFinite(hue) &&
            hue >= 0 &&
            hue <= 360,
        )))
  );
}

/**
 * Validate strategy path to role name to model string records.
 * @param {unknown} value - Decoded browser data.
 * @returns {boolean} Whether every entry is a string-to-string record.
 */
function isStrategyModelRoles(value: unknown): value is StrategyModelRoles {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (roles) =>
        typeof roles === "object" &&
        roles !== null &&
        !Array.isArray(roles) &&
        Object.values(roles).every((model) => typeof model === "string"),
    )
  );
}
