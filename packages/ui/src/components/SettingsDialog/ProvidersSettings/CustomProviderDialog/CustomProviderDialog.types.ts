import type { z } from "zod";
import type { customProviderSchema } from "./CustomProviderDialog.schemas";

/** Editable custom endpoint fields before persistence. */
export type CustomProviderValues = z.infer<typeof customProviderSchema>;
