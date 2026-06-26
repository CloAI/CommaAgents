import type { McpServerStatusWire } from "@comma-agents/daemon";
import type { DaemonCommandMap } from "../useDaemon";

export type McpListOptions = DaemonCommandMap["list_mcp_servers"];

export type McpUpdateOptions = DaemonCommandMap["update_mcp_server"];

export interface McpContextType {
  readonly servers: readonly McpServerStatusWire[];
  readonly refresh: (options?: McpListOptions) => void;
  readonly update: (options: McpUpdateOptions) => void;
}

export interface McpContextProviderProps {
  readonly children: React.ReactNode;
}
