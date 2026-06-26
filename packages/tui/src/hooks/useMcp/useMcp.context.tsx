import { createContext, useCallback, useMemo, useState } from "react";

import { useDaemonCommand } from "../useDaemon/useDaemonCommand/useDaemonCommand";
import { useDaemonSubscription } from "../useDaemon/useDaemonSubscription/useDaemonSubscription";
import type {
  McpContextProviderProps,
  McpContextType,
  McpListOptions,
  McpUpdateOptions,
} from "./useMcp.types";

export const McpContext = createContext<McpContextType | null>(null);

export function McpContextProvider({
  children,
}: McpContextProviderProps): React.ReactElement {
  const [servers, setServers] = useState<McpContextType["servers"]>([]);
  const listMcpServers = useDaemonCommand("list_mcp_servers");
  const updateMcpServer = useDaemonCommand("update_mcp_server");

  useDaemonSubscription("mcp_server_list", (message) => {
    setServers(message.servers);
  });

  const refresh = useCallback(
    (options: McpListOptions = {}): void => {
      listMcpServers(options);
    },
    [listMcpServers],
  );

  const update = useCallback(
    (options: McpUpdateOptions): void => {
      updateMcpServer(options);
    },
    [updateMcpServer],
  );

  const contextValue = useMemo<McpContextType>(
    () => ({ servers, refresh, update }),
    [servers, refresh, update],
  );

  return (
    <McpContext.Provider value={contextValue}>{children}</McpContext.Provider>
  );
}
