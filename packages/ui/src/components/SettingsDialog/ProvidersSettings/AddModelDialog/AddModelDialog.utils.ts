import { COST_FIELDS, TOKEN_FIELDS } from "./AddModelDialog.constants";
import type {
  CapabilityDraft,
  ModalityDraft,
  ModelDraft,
  ModelMetadata,
} from "./AddModelDialog.types";

/** Parse optional model fields while preserving unknown capabilities and zero prices.
 * @param {ModelDraft} draft - Optional text and numeric fields.
 * @param {CapabilityDraft} capabilities - Explicit capability choices.
 * @param {ModalityDraft} modalities - Optional modality selections.
 * @returns {ModelMetadata} Validated metadata without unknown values.
 */
export function parseModelMetadata(
  draft: ModelDraft,
  capabilities: CapabilityDraft,
  modalities: ModalityDraft,
): ModelMetadata {
  const metadata: ModelMetadata = {};
  if (draft.name.trim()) metadata.name = draft.name.trim();
  for (const { key, label } of TOKEN_FIELDS) {
    if (!draft[key].trim()) continue;
    const value = Number(draft[key]);
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error(`${label} must be a nonnegative whole number.`);
    metadata[key] = value;
  }
  for (const key of [
    "knowledgeCutoff",
    "releaseDate",
    "lastUpdated",
  ] as const) {
    const value = draft[key].trim();
    if (!value) continue;
    const normalized =
      key === "knowledgeCutoff" && /^\d{4}-\d{2}$/.test(value)
        ? `${value}-01`
        : value;
    const date = new Date(`${normalized}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(normalized) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== normalized
    )
      throw new Error(
        `${key === "knowledgeCutoff" ? "Knowledge cutoff" : key === "releaseDate" ? "Release date" : "Last updated"} must be a valid ${key === "knowledgeCutoff" ? "YYYY-MM or YYYY-MM-DD" : "YYYY-MM-DD"} date.`,
      );
    metadata[key] = value;
  }
  if (draft.status) metadata.status = draft.status as ModelMetadata["status"];
  const selectedCapabilities: NonNullable<ModelMetadata["capabilities"]> = {};
  for (const key of Object.keys(capabilities) as (keyof CapabilityDraft)[]) {
    if (capabilities[key]) selectedCapabilities[key] = true;
  }
  if (Object.keys(selectedCapabilities).length)
    metadata.capabilities = selectedCapabilities;
  if (modalities.input.length || modalities.output.length)
    metadata.modalities = {
      ...(modalities.input.length
        ? {
            input: [...modalities.input] as NonNullable<
              ModelMetadata["modalities"]
            >["input"],
          }
        : {}),
      ...(modalities.output.length
        ? {
            output: [...modalities.output] as NonNullable<
              ModelMetadata["modalities"]
            >["output"],
          }
        : {}),
    };
  const cost: NonNullable<ModelMetadata["cost"]> = {};
  for (const { key, metadataKey, label } of COST_FIELDS) {
    if (!draft[key].trim()) continue;
    const value = Number(draft[key]);
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`${label} pricing must be a nonnegative number.`);
    cost[metadataKey] = value;
  }
  if (Object.keys(cost).length) metadata.cost = cost;
  return metadata;
}

/** Extract a safe operation message without serializing arguments or response data.
 * @param {unknown} error - Operation failure.
 * @returns {string} Safe user-facing message.
 */
export function modelErrorMessage(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : "Could not save the model.";
}

/** Remove only a redundant selected-provider prefix; preserve provider-local namespaces.
 * @param {string} providerId - Already selected provider identity.
 * @param {string} modelId - Entered model identifier, optionally fully qualified.
 * @returns {string} Provider-local model ID ready for a command argument.
 */
export function normalizeModelId(providerId: string, modelId: string): string {
  const value = modelId.trim();
  return providerId && value.startsWith(`${providerId}/`)
    ? value.slice(providerId.length + 1)
    : value;
}
