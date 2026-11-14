import type { DaemonChannelMap } from "@comma-agents/daemon/protocol";

/** Provider metadata returned by the daemon's discovery command. */
export type DiscoveredProvider =
  DaemonChannelMap["core.providers.list"]["message"]["data"]["providers"][number];

/** Model metadata returned by provider discovery. */
export type DiscoveredModel = DiscoveredProvider["models"][number];

/** Capability flags a model can declare. */
export type ModelCapability = keyof NonNullable<
  DiscoveredModel["metadata"]["capabilities"]
>;
