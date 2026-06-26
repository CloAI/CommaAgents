import { useContext } from "react";

import { McpContext } from "./useMcp.context";
import type { McpContextType } from "./useMcp.types";

export function useMcp(): McpContextType {
  const context = useContext(McpContext);
  if (!context) {
    throw new Error("useMcp must be used within an McpContextProvider");
  }
  return context;
}
