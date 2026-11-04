import type { SelectOption } from "../../design-system/Select";
import type { DaemonChannelMap } from "@comma-agents/daemon/protocol";

/** Provider metadata returned by the daemon's discovery command. */
export type DiscoveredProvider =
  DaemonChannelMap["core.providers.list"]["message"]["data"]["providers"][number];

/** Model metadata returned by provider discovery. */
export type DiscoveredModel = DiscoveredProvider["models"][number];

/** Model choice retaining capabilities for display beside its name. */
export interface StrategyModelOption extends SelectOption {
  /** Explicitly supported features reported by model discovery. */
  readonly capabilities?: DiscoveredModel["metadata"]["capabilities"];
}
