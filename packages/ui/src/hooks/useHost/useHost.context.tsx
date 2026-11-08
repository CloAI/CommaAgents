import { createContext } from "react";
import type { ReactNode } from "react";
import type { HostCapabilities } from "./useHost.types";

/** Capabilities of a plain browser tab. */
export const WEB_HOST: HostCapabilities = {};

export const HostContext = createContext<HostCapabilities>(WEB_HOST);

/** Application content running inside a host. */
export interface HostProviderProps {
  /** What the host offers. */
  readonly host: HostCapabilities;
  /** Components that may use the host's capabilities. */
  readonly children: ReactNode;
}

/**
 * Make a host's capabilities available to the application.
 * @param {HostProviderProps} props - Host and content.
 * @returns {React.ReactElement} The host provider.
 */
export function HostProvider({ host, children }: HostProviderProps) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}
