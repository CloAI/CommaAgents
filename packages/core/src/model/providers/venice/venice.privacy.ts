import { privacyError } from "../../privacy/privacy.utils";
import { DEFAULT_NRAS_URL, DEFAULT_PCCS_URL } from "./venice.constants";
import { VenicePrivacyOptionsSchema } from "./venice.schemas";
import type {
  ResolvedVenicePrivacyOptions,
  VenicePrivacyOptions,
} from "./venice.types";

/** Validate Venice services and approval profiles before resolving a protected model.
 * @param {VenicePrivacyOptions} options - Provider-scoped configuration.
 * @param {VenicePrivacyOptions} legacy - Compatible top-level settings, without overlapping options.
 * @returns {ResolvedVenicePrivacyOptions} Validated verification services and workload policies.
 */
export function resolveVenicePrivacyOptions(
  options: VenicePrivacyOptions = {},
  legacy: VenicePrivacyOptions = {},
): ResolvedVenicePrivacyOptions {
  const parsed = VenicePrivacyOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  for (const field of ["pccsURL", "nrasURL", "trustedWorkloads"] as const) {
    if (parsed.data[field] !== undefined && legacy[field] !== undefined) {
      throw privacyError("PRIVACY_CONFIGURATION_ERROR");
    }
  }
  const combined = VenicePrivacyOptionsSchema.safeParse({
    allowUnboundReceipts: parsed.data.allowUnboundReceipts,
    pccsURL: parsed.data.pccsURL ?? legacy.pccsURL,
    nrasURL: parsed.data.nrasURL ?? legacy.nrasURL,
    trustedWorkloads: parsed.data.trustedWorkloads ?? legacy.trustedWorkloads,
  });
  if (!combined.success) {
    throw privacyError("PRIVACY_CONFIGURATION_ERROR");
  }
  return Object.freeze({
    allowUnboundReceipts: combined.data.allowUnboundReceipts ?? false,
    pccsURL: combined.data.pccsURL ?? DEFAULT_PCCS_URL,
    nrasURL: combined.data.nrasURL ?? DEFAULT_NRAS_URL,
    trustedWorkloads: combined.data.trustedWorkloads ?? {},
  });
}
