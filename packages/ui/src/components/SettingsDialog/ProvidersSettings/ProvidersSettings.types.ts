import type {
  DaemonChannelMap,
  DaemonCommandMap,
} from "@comma-agents/daemon/protocol";

/** Provider metadata returned by the daemon's discovery command. */
export type DiscoveredProvider =
  DaemonChannelMap["core.providers.list"]["message"]["data"]["providers"][number];

/** Model metadata returned by provider discovery. */
export type DiscoveredModel = DiscoveredProvider["models"][number];

/** Capability flags a model can declare. */
export type ModelCapability = keyof NonNullable<
  DiscoveredModel["metadata"]["capabilities"]
>;

/** Latest explicit credential check in this view; never persisted. */
export type ProviderVerification =
  DaemonCommandMap["core.providers.verify"]["result"];

/** Provider workflows that open in a modal above the providers panel. */
export type ProviderModal =
  | "addModel"
  | "configureProvider"
  | "customProvider"
  | "removeModel";
