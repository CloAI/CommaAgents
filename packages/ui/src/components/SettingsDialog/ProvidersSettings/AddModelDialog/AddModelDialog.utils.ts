import { modelDraftSchema } from "./AddModelDialog.schemas";
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
  const validation = modelDraftSchema.safeParse(draft);
  if (!validation.success) {
    throw new Error(validation.error.issues[0]?.message);
  }
  const metadata: ModelMetadata = {};
  if (draft.name.trim()) {
    metadata.name = draft.name.trim();
  }
  for (const { key } of TOKEN_FIELDS) {
    if (!draft[key].trim()) {
      continue;
    }
    const value = Number(draft[key]);
    metadata[key] = value;
  }
  for (const key of [
    "knowledgeCutoff",
    "releaseDate",
    "lastUpdated",
  ] as const) {
    const value = draft[key].trim();
    if (!value) {
      continue;
    }
    metadata[key] = value;
  }
  if (draft.status) {
    metadata.status = draft.status as ModelMetadata["status"];
  }
  const selectedCapabilities: NonNullable<ModelMetadata["capabilities"]> = {};
  for (const key of Object.keys(capabilities) as (keyof CapabilityDraft)[]) {
    if (capabilities[key]) {
      selectedCapabilities[key] = true;
    }
  }
  if (Object.keys(selectedCapabilities).length) {
    metadata.capabilities = selectedCapabilities;
  }
  if (modalities.input.length || modalities.output.length) {
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
  }
  const cost: NonNullable<ModelMetadata["cost"]> = {};
  for (const { key, metadataKey } of COST_FIELDS) {
    if (!draft[key].trim()) {
      continue;
    }
    const value = Number(draft[key]);
    cost[metadataKey] = value;
  }
  if (Object.keys(cost).length) {
    metadata.cost = cost;
  }
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
