import { z } from "zod/v4";

/** Providers implementing browser subscription sign-in. */
export const ProviderSignInArgumentsSchema = z
  .object({ providerId: z.enum(["openai", "github-copilot"]) })
  .strict();
/** Opaque handle for a pending sign-in; never contains credentials. */
export const ProviderSignInAttemptArgumentsSchema = z
  .object({ attemptId: z.string().uuid() })
  .strict();
/** Browser sign-in progress, safe to send to a client. */
export const ProviderSignInStatusSchema = z.object({
  attemptId: z.string().uuid(),
  status: z.enum(["pending", "connected", "cancelled", "error"]),
  message: z.string().optional(),
});
/** Authorization URL and handle; tokens remain in the core process. */
export const ProviderSignInStartSchema = z.object({
  attemptId: z.string().uuid(),
  authorizationURL: z.string().url(),
  /** One-time code to enter on a device authorization page. */
  userCode: z.string().optional(),
});
