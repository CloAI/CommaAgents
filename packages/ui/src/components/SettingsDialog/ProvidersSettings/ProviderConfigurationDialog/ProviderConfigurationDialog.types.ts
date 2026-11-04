import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";

/** Result of the latest explicit provider check. */
export type ProviderVerification =
  DaemonCommandMap["core.providers.verify"]["result"];
/** Secret-free provider configuration read from core. */
export type ProviderConfiguration =
  DaemonCommandMap["core.providers.getConfiguration"]["result"];
/** Credential changes invalidate the displayed check until the supplied result is applied. */
export interface ProviderSettingsChange {
  /** Provider whose credentials or endpoint changed. */
  readonly providerId: string;
  /** Latest check, omitted when no verification was performed. */
  readonly verification?: ProviderVerification;
}
/** Steps rendered inside the one active workflow dialog. */
export type ProviderConfigurationStep = "form" | "verificationIssue" | "remove";
