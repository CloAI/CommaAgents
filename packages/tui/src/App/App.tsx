import { useApp, useFocusManager, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";

import { CommandPalette } from "../components/CommandPalette";
import { Frame } from "../components/Frame";
import type { TabDefinition } from "../components/Frame/Frame";
import { McpConnectionFailureModal } from "../components/McpConnectionFailureModal";
import { ContextUsageModal, OutputModal } from "../components/MessageList";
import { Modal } from "../components/Modal";
import { StatusBar } from "../components/StatusBar";
import { useChatState } from "../hooks/useChat";
import { useMcp } from "../hooks/useMcp";
import { useModal } from "../hooks/useModal";
import { ChatPage } from "../pages/ChatPage";
import { IntroPage } from "../pages/IntroPage";
import { LogsPage } from "../pages/LogsPage";
import { SpawnedStrategyPage } from "../pages/SpawnedStrategyPage";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

const COMMAND_PALETTE_MODAL_ID = "command-palette";

const BASE_TABS: readonly TabDefinition[] = [
  { path: "/", label: "Chat", shortcut: "Alt+1" },
  { path: "/logs", label: "Logs", shortcut: "Alt+2" },
] as const;

const DEV_TAB: TabDefinition = {
  path: "/dev",
  label: "Dev",
  shortcut: "Alt+3",
} as const;

export interface AppProps {
  /** Whether to enable developer-specific tabs and tools. @default false */
  readonly devMode?: boolean;
}

export function App({ devMode = false }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { enableFocus } = useFocusManager();
  const navigate = useNavigate();
  const location = useLocation();
  const commandPalette = useModal(COMMAND_PALETTE_MODAL_ID);
  const { servers: mcpServers, refresh: refreshMcpServers } = useMcp();
  const chatRunId = chatRunIdFromPath(location.pathname);
  const chatState = useChatState(chatRunId);
  const displayedMcpServers =
    chatRunId && chatState.mcpServers.length > 0
      ? chatState.mcpServers
      : mcpServers;

  useEffect(() => {
    enableFocus();
  }, [enableFocus]);

  useEffect(() => {
    refreshMcpServers({
      cwd: process.cwd(),
      ...(chatRunId ? { runId: chatRunId } : {}),
      ...(chatState.strategyPath
        ? { strategyPath: chatState.strategyPath }
        : {}),
    });
  }, [chatRunId, chatState.strategyPath, refreshMcpServers]);

  const tabs = useMemo<readonly TabDefinition[]>(
    () => (devMode ? [...BASE_TABS, DEV_TAB] : BASE_TABS),
    [devMode],
  );

  const handleTabSelect = useCallback(
    (tabPath: string): void => {
      navigate(tabPath);
    },
    [navigate],
  );

  useInput(
    (inputText, keyPress) => {
      if (keyPress.ctrl && inputText === "c") {
        exit();
      }
      if (keyPress.ctrl && inputText === "p") {
        commandPalette.toggle();
      }
      if (keyPress.meta && inputText === "1") navigate("/");
      if (keyPress.meta && inputText === "2") navigate("/logs");
      if (keyPress.meta && inputText === "3" && devMode) navigate("/dev");
    },
    { isActive: RAW_MODE_SUPPORTED },
  );

  return (
    <AppRender
      tabs={tabs}
      activeTabPath={location.pathname}
      onTabSelect={handleTabSelect}
      commandPaletteOpen={commandPalette.isOpen}
      onCommandPaletteClose={commandPalette.close}
      initialCommandId={
        isCommandPaletteData(commandPalette.data)
          ? commandPalette.data.commandId
          : undefined
      }
      chatStatus={chatState.status}
      chatError={chatState.error}
      strategyName={chatState.strategyName ?? undefined}
      mcpServers={displayedMcpServers}
      onOpenMcpServers={() => commandPalette.open({ commandId: "mcp-servers" })}
      chatRunId={chatRunId}
    />
  );
}

export interface AppRenderProps {
  /** The list of tabs to display in the frame. */
  readonly tabs: readonly TabDefinition[];
  /** The path of the currently active tab. */
  readonly activeTabPath: string;
  /** Callback invoked when a tab is selected. */
  readonly onTabSelect: (path: string) => void;
  /** Whether the command palette modal is currently open. */
  readonly commandPaletteOpen: boolean;
  /** Callback invoked to close the command palette. */
  readonly onCommandPaletteClose: () => void;
  readonly initialCommandId?: string;
  readonly chatStatus: import("../hooks/useChat").ChatStatus;
  readonly chatError: string | null;
  readonly strategyName?: string;
  readonly mcpServers: readonly import("@comma-agents/daemon").McpServerStatusWire[];
  readonly onOpenMcpServers: () => void;
  readonly chatRunId: string;
}

export function AppRender({
  tabs,
  activeTabPath,
  onTabSelect,
  commandPaletteOpen,
  onCommandPaletteClose,
  initialCommandId,
  chatStatus,
  chatError,
  strategyName,
  mcpServers,
  onOpenMcpServers,
  chatRunId,
}: AppRenderProps): React.ReactElement {
  const enabledMcpServers = mcpServers.filter(
    (server) => server.enabled,
  ).length;
  return (
    <>
      <Frame
        tabs={tabs}
        activeTabPath={activeTabPath}
        onTabSelect={onTabSelect}
        footer={
          <StatusBar
            status={chatStatus}
            error={chatError}
            strategyName={strategyName}
            mcpEnabled={enabledMcpServers}
            mcpTotal={mcpServers.length}
            onMcpPress={onOpenMcpServers}
          />
        }
      >
        <Routes>
          <Route index element={<IntroPage />} />
          <Route path="/chat/:chatRunId" element={<ChatPage />} />
          <Route
            path="/chat/:chatRunId/spawned/:toolCallId"
            element={<SpawnedStrategyPage />}
          />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </Frame>
      <Modal
        title="Command Palette"
        modalId={COMMAND_PALETTE_MODAL_ID}
        closeOnEsc={false}
        minHeight="60%"
        maxHeight="60%"
      >
        <CommandPalette
          isVisible={commandPaletteOpen}
          onClose={onCommandPaletteClose}
          initialCommandId={initialCommandId}
        />
      </Modal>
      <ContextUsageModal />
      <OutputModal />
      {chatRunId ? <McpConnectionFailureModal chatRunId={chatRunId} /> : null}
    </>
  );
}

function chatRunIdFromPath(pathname: string): string {
  const match = /^\/chat\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : "";
}

function isCommandPaletteData(
  value: unknown,
): value is { readonly commandId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "commandId" in value &&
    typeof value.commandId === "string"
  );
}
