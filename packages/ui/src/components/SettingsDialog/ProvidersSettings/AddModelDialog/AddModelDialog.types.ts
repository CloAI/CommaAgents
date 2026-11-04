import type { z } from "zod";
import type {
  addModelSchema,
  modelDraftSchema,
} from "./AddModelDialog.schemas";
import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";
import type { ModelCapability } from "../ProvidersSettings.types";

/** Model additions retain provider-local identity and optional metadata. */
export type AddModelArguments =
  DaemonCommandMap["core.providers.addCustomProviderModel"]["arguments"];
/** Optional user-authored metadata accepted by the daemon. */
export type ModelMetadata = NonNullable<AddModelArguments["metadata"]>;
/** Text values remain drafts until form submission validates them. */
export type ModelDraft = z.infer<typeof modelDraftSchema>;
/** Values owned by the model form. */
export type AddModelValues = z.infer<ReturnType<typeof addModelSchema>>;
/** Enable supported capabilities; disabled toggles leave metadata unspecified. */
export type CapabilityDraft = Record<ModelCapability, boolean>;
/** Input/output modalities are optional; empty selection means unknown. */
export type ModalityDraft = {
  readonly input: readonly string[];
  readonly output: readonly string[];
};
