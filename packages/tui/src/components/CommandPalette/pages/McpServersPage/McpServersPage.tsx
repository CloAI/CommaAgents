import type { McpServerStatusWire } from "@comma-agents/daemon";
import { Box, Text, useFocus, useInput } from "ink";
import React from "react";
import { useLocation } from "react-router";

import { useChatState } from "../../../../hooks/useChat";
import { useMcp } from "../../../../hooks/useMcp";
import { useTheme } from "../../../../Theme";
import { ScrollableList } from "../../../ScrollableList";

export interface McpServersPageProps {
  readonly focusId: string;
  readonly onBack: () => void;
}

export function McpServersPage({
  focusId,
  onBack,
}: McpServersPageProps): React.ReactElement {
  const location = useLocation();
  const runId = chatRunIdFromPath(location.pathname);
  const chatState = useChatState(runId);
  const { servers, refresh, update } = useMcp();
  const tokens = useTheme();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const { isFocused } = useFocus({ id: focusId });
  const visibleServers = runId
    ? servers.filter(
        (server) =>
          server.assignedAgents.length > 0 || server.source === "strategy",
      )
    : servers.filter((server) => server.source !== "strategy");

  React.useEffect(() => {
    refresh({
      cwd: process.cwd(),
      ...(runId ? { runId } : {}),
      ...(chatState.strategyPath
        ? { strategyPath: chatState.strategyPath }
        : {}),
    });
  }, [chatState.strategyPath, refresh, runId]);

  React.useEffect(() => {
    if (selectedIndex >= visibleServers.length) {
      setSelectedIndex(Math.max(0, visibleServers.length - 1));
    }
  }, [selectedIndex, visibleServers.length]);

  const toggleServer = React.useCallback(
    (serverIndex: number): void => {
      const server = visibleServers[serverIndex];
      if (!server) return;
      update({
        serverId: server.id,
        enabled: !server.enabled,
        scope: runId ? "run" : "default",
        cwd: process.cwd(),
        ...(runId ? { runId } : {}),
        ...(chatState.strategyPath
          ? { strategyPath: chatState.strategyPath }
          : {}),
      });
    },
    [chatState.strategyPath, runId, update, visibleServers],
  );

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
        return;
      }
      if (input !== "g" || !runId) return;
      const server = visibleServers[selectedIndex];
      if (!server || server.source === "strategy") return;
      update({
        serverId: server.id,
        enabled: server.enabled,
        scope: "default",
        cwd: process.cwd(),
        runId,
        ...(chatState.strategyPath
          ? { strategyPath: chatState.strategyPath }
          : {}),
      });
    },
    {
      isActive: isFocused,
    },
  );

  return (
    <McpServersPageRender
      tokens={tokens}
      servers={visibleServers}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={setSelectedIndex}
      onSelected={toggleServer}
      isFocused={isFocused}
      isRunScoped={Boolean(runId)}
    />
  );
}

export interface McpServersPageRenderProps {
  /** Theme tokens used to style server states and selection. */
  readonly tokens: ReturnType<typeof useTheme>;
  /** MCP servers visible in the current default or run scope. */
  readonly servers: readonly McpServerStatusWire[];
  /** Index of the highlighted server. */
  readonly selectedIndex: number;
  /** Update the highlighted server index. */
  readonly onSelectedIndexChange: (index: number) => void;
  /** Toggle the server at the selected index. */
  readonly onSelected: (index: number) => void;
  /** Whether the server list currently owns keyboard focus. */
  readonly isFocused: boolean;
  /** Whether server choices apply to one active chat run. */
  readonly isRunScoped: boolean;
}

/** Presentational MCP server list used by the command-palette page. */
export function McpServersPageRender({
  tokens,
  servers,
  selectedIndex,
  onSelectedIndexChange,
  onSelected,
  isFocused,
  isRunScoped,
}: McpServersPageRenderProps): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexGrow={1} overflow="hidden">
        <ScrollableList
          items={servers}
          getKey={(server) => server.id}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={onSelectedIndexChange}
          onSelected={(_server, index) => onSelected(index)}
          isFocused={isFocused}
          emptyText="No MCP servers configured"
          renderItem={(server, isSelected) => (
            <Box
              flexDirection="column"
              paddingX={1}
              backgroundColor={isSelected ? tokens.colors.surface : undefined}
            >
              <Box>
                <Box width={22} flexShrink={0}>
                  <Text
                    bold={isSelected}
                    color={
                      server.enabled
                        ? tokens.colors.success
                        : tokens.colors.muted
                    }
                  >
                    {server.enabled ? "● " : "○ "}
                    {server.id}
                  </Text>
                </Box>
                <Box width={12} flexShrink={0}>
                  <Text color={tokens.colors.primary}>{server.transport}</Text>
                </Box>
                <Text color={tokens.colors.muted}>
                  {server.connected === true
                    ? `${server.toolCount} tools`
                    : server.error
                      ? "failed"
                      : server.source}
                </Text>
              </Box>
              {isSelected ? (
                <Text
                  color={
                    server.error ? tokens.colors.error : tokens.colors.muted
                  }
                >
                  {server.error ??
                    `source: ${server.source}${
                      server.assignedAgents.length > 0
                        ? ` · agents: ${server.assignedAgents.join(", ")}`
                        : ""
                    }`}
                </Text>
              ) : null}
            </Box>
          )}
        />
      </Box>
      <Text dimColor>
        Enter to toggle
        {isRunScoped ? " · g to save current choice as the shared default" : ""}
        {" · Esc to go back"}
      </Text>
    </Box>
  );
}

function chatRunIdFromPath(pathname: string): string {
  const match = /^\/chat\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : "";
}
