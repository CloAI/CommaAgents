import { z } from "zod";
import { WorkloadPolicySchema } from "./verification/measurements/measurements.schemas";

const verificationServiceSchema = z
  .string()
  .url()
  .refine((address) => {
    try {
      const endpoint = new URL(address);
      return (
        endpoint.protocol === "https:" &&
        !endpoint.username &&
        !endpoint.password &&
        !endpoint.search &&
        !endpoint.hash
      );
    } catch {
      return false;
    }
  });

/** Venice verification settings are application-owned and validated before any request. */
export const VenicePrivacyOptionsSchema = z
  .object({
    allowUnboundReceipts: z.boolean().optional(),
    pccsURL: verificationServiceSchema.optional(),
    nrasURL: verificationServiceSchema.optional(),
    trustedWorkloads: z
      .record(
        z.string().regex(/^venice\/[^/\s]+$/),
        z.array(WorkloadPolicySchema).nonempty(),
      )
      .optional(),
  })
  .strict();
