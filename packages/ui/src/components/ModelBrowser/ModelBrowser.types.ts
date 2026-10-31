import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";

/** Provider metadata returned by the daemon's discovery command. */
export type DiscoveredProvider =
  DaemonCommandMap["core.providers.list"]["result"]["providers"][number];

/** Model metadata returned by provider discovery. */
export type DiscoveredModel = DiscoveredProvider["models"][number];

/** Capability flags that can be required by the model filter. */
export type ModelCapability = keyof NonNullable<
  DiscoveredModel["metadata"]["capabilities"]
>;

/** Latest explicit check in this provider-settings view; never persisted. */
export type ProviderVerification =
  DaemonCommandMap["core.providers.verify"]["result"];
