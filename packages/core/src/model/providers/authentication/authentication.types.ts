import type { z } from "zod/v4";
import type {
  ProviderSignInStatusSchema,
  ProviderSignInStartSchema,
} from "./authentication.schemas";

/** Secret-free progress of one browser sign-in. */
export type ProviderSignInStatus = z.output<typeof ProviderSignInStatusSchema>;
/** Core-owned browser sign-in with bounded attempts and explicit disposal. */
export interface ProviderAuthentication {
  /** Start a local browser sign-in and return its authorization URL. */
  readonly beginSignIn: (options: {
    readonly providerId: "openai";
  }) => Promise<z.output<typeof ProviderSignInStartSchema>>;
  /** Read progress without making another provider request. */
  readonly getSignInStatus: (options: {
    readonly attemptId: string;
  }) => ProviderSignInStatus;
  /** Cancel an unfinished attempt, preserving existing credentials. */
  readonly cancelSignIn: (options: {
    readonly attemptId: string;
  }) => ProviderSignInStatus;
  /** Close listeners and cancel outstanding exchanges. */
  readonly dispose: () => void;
}
