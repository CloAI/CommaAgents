import type {
  DaemonChannelMap,
  DaemonCommandMap,
} from "@comma-agents/daemon/protocol";

/** Provider metadata returned by the daemon's discovery command. */
export type DiscoveredProvider =
  DaemonChannelMap["core.providers.list"]["message"]["data"]["providers"][number];

/** Model metadata returned by provider discovery. */
export type DiscoveredModel = DiscoveredProvider["models"][number];

/** Latest explicit credential check; never persisted. */
export type ProviderVerification =
  DaemonCommandMap["core.providers.verify"]["result"];

/** How a provider's connection is shown in its heading. */
export interface ProviderStatus {
  /** Credential action offered for the provider. */
  readonly actionLabel: "Configure" | "Connect";
  /** Short connection state shown beside the name. */
  readonly connectionLabel: "Verified" | "Connected" | "Needs credentials";
  /** Indicator color. */
  readonly indicator: "configured" | "unconfigured" | "warning";
  /** Full accessible description of the indicator. */
  readonly description: string;
}

/** A button shown beside a provider's heading. */
export interface ProviderAction {
  /** Visible button text; may change with the provider's status. */
  readonly label: string;
  /** Accessible name when the label alone is ambiguous. */
  readonly ariaLabel?: string;
  /** Run the action. */
  readonly action: () => void;
}
