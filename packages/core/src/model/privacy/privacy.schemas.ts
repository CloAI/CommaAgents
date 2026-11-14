import { z } from "zod";

/** Serialized protection requirements; E2EE always requires verified TEE. */
export const PrivacyRequirementsSchema = z
  .object({
    tee: z.literal("required").optional(),
    e2ee: z.literal("required").optional(),
  })
  .strict()
  .refine(
    (requirements) => !requirements.e2ee || requirements.tee === "required",
    {
      message: "E2EE requires TEE protection.",
    },
  );
