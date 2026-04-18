import { useContext } from "react";

import { DaemonContext } from "./useDaemon.context";
import type { DaemonContextValue } from "./useDaemon.types";

/**
 * Access the daemon context.
 *
 * Must be called inside a `<DaemonProvider>`. Throws if used outside.
 */
export function useDaemonContext(): DaemonContextValue {
  const contextValue = useContext(DaemonContext);
  if (!contextValue) {
    throw new Error("useDaemonContext must be used within a <DaemonProvider>");
  }
  return contextValue;
}
