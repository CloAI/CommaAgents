import { useContext } from "react";
import { HostContext } from "./useHost.context";
import type { HostCapabilities } from "./useHost.types";

/**
 * Read what the surrounding application offers; a browser tab by default.
 * @returns {HostCapabilities} The host's capabilities.
 */
export function useHost(): HostCapabilities {
  return useContext(HostContext);
}
