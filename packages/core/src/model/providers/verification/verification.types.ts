import type { z } from "zod/v4";
import type {
  ProviderVerificationSchema,
  VerifyProviderArgumentsSchema,
} from "./verification.schemas";

/** Request-local result; verification does not establish generation access or credit. */
export type ProviderVerificationResult = Readonly<
  z.output<typeof ProviderVerificationSchema>
>;
/** Outcome of a single non-generation credential check. */
export type ProviderVerificationStatus = ProviderVerificationResult["status"];

/** Provider selected for verification. */
export type VerifyProviderArguments = Readonly<
  z.input<typeof VerifyProviderArgumentsSchema>
>;

/** Cancellation supplied by the owning application or daemon plugin. */
export interface VerifyProviderOptions {
  /** Abort an in-flight check without retrying. */
  readonly signal?: AbortSignal;
}

/** @internal Fixed authenticated request and provider-specific payload validation. */
export interface ProviderVerificationRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly acceptsResponse: (response: unknown) => boolean;
  readonly invalidCredentialStatuses: readonly number[];
}
