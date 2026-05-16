import { useContext } from "react";

import { DaemonContext } from "./useDaemon.context";
import type { DaemonContextValue } from "./useDaemon.types";

/**
 * Access the daemon context.
 *
 * Must be called inside a `<DaemonContextProvider>`. Throws if used outside.
 */
export function useDaemon(): DaemonContextValue {
  const contextValue = useContext(DaemonContext);
  if (contextValue === null) {
    throw new Error("useDaemon must be used within a <DaemonContextProvider>");
  }
  return contextValue;
}
