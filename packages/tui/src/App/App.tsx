import { useApp, useFocusManager, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";

import { CommandPalette } from "../components/CommandPalette";
import { Frame } from "../components/Frame";
import type { TabDefinition } from "../components/Frame/Frame";
import { OutputModal } from "../components/MessageList";
import { Modal } from "../components/Modal";
import { useChatRuns } from "../hooks/useChat";
import { useModal } from "../hooks/useModal";
import { ChatPage } from "../pages/ChatPage";
import { IntroPage } from "../pages/IntroPage";
import { LogsPage } from "../pages/LogsPage";

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
  const chatRunsContext = useChatRuns();
  const commandPalette = useModal(COMMAND_PALETTE_MODAL_ID);

  useEffect(() => {
    enableFocus();
  }, [enableFocus]);

  const tabs = useMemo<readonly TabDefinition[]>(
    () => (devMode ? [...BASE_TABS, DEV_TAB] : BASE_TABS),
    [devMode],
  );

  const handleResetChat = useCallback((): void => {
    chatRunsContext.clearAllChatRuns();
  }, [chatRunsContext]);

  const handleExitApp = useCallback((): void => {
    exit();
  }, [exit]);

  const handleTabSelect = useCallback(
    (tabPath: string): void => {
      navigate(tabPath);
    },
    [navigate],
  );

  useInput(
    (inputText, keyPress) => {
      if (keyPress.ctrl && inputText === "c") {
        handleExitApp();
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
      onExitApp={handleExitApp}
      onResetChat={handleResetChat}
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
  /** Callback invoked to exit the application. */
  readonly onExitApp: () => void;
  /** Callback invoked to reset the chat history. */
  readonly onResetChat: () => void;
}

export function AppRender({
  tabs,
  activeTabPath,
  onTabSelect,
  commandPaletteOpen,
  onCommandPaletteClose,
  onExitApp,
  onResetChat,
}: AppRenderProps): React.ReactElement {
  return (
    <>
      <Frame
        tabs={tabs}
        activeTabPath={activeTabPath}
        onTabSelect={onTabSelect}
      >
        <Routes>
          <Route index element={<IntroPage />} />
          <Route path="/chat" element={<ChatPage />} />
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
          onExitApp={onExitApp}
          onResetChat={onResetChat}
        />
      </Modal>
      <OutputModal />
    </>
  );
}
