import { useApp, useFocusManager, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";

import { CommandPalette } from "../components/CommandPalette";
import { Frame } from "../components/Frame";
import type { TabDefinition } from "../components/Frame/Frame";
import { OutputModal } from "../components/MessageList";
import { Modal } from "../components/Modal";
import type { StrategyOption } from "../components/StrategyPicker";
import { useChat } from "../hooks";
import { useLogs } from "../hooks/useLogs";
import { useModal } from "../hooks/useModal";
import { ChatPage } from "../pages/ChatPage";
import { IntroPage } from "../pages/IntroPage";
import { LogsPage } from "../pages/LogsPage";
import { discoverStrategies } from "../strategy-discovery";
import { resolveStrategyOption } from "./App.utils";
import type { AppProps, AppRenderProps } from "./App.types";

/** Whether stdin supports raw mode (false in piped/non-TTY contexts). */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/** Modal id for the command palette. */
const COMMAND_PALETTE_MODAL_ID = "command-palette";

/**
 * Discover available strategies once on mount.
 *
 * `discoverStrategies()` is async (parses & validates each candidate),
 * so we kick it off in `useEffect` and store the result in state.
 * Initial value is an empty array; the picker renders empty for a
 * single frame and then populates.
 */
function useDiscoveredStrategies(): readonly StrategyOption[] {
  const [strategies, setStrategies] = useState<readonly StrategyOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    discoverStrategies()
      .then((result) => {
        if (!cancelled) setStrategies(result);
      })
      .catch(() => {
        // Discovery failures are silent — the picker just stays empty.
        // Real failures surface as warnings in the underlying core call.
      });
    return (): void => {
      cancelled = true;
    };
  }, []);
  return strategies;
}

/** Tab route definitions. Order determines display order in the Frame header. */
const BASE_TABS: readonly TabDefinition[] = [
  { path: "/chat", label: "Chat", shortcut: "Alt+1" },
  { path: "/logs", label: "Logs", shortcut: "Alt+2" },
] as const;

const DEV_TAB: TabDefinition = {
  path: "/dev",
  label: "Dev",
  shortcut: "Alt+3",
} as const;

export function App({
  strategy: preselectedStrategy,
  initialInput,
  devMode = false,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { enableFocus } = useFocusManager();
  const navigate = useNavigate();
  const location = useLocation();
  const chat = useChat();
  const { logs, clearLogs } = useLogs();
  const commandPalette = useModal(COMMAND_PALETTE_MODAL_ID);

  const strategies = useDiscoveredStrategies();

  // Ensure Ink's focus system is active for tab-order cycling across inputs.
  useEffect(() => {
    enableFocus();
  }, [enableFocus]);

  const tabs = useMemo<readonly TabDefinition[]>(
    () => (devMode ? [...BASE_TABS, DEV_TAB] : BASE_TABS),
    [devMode],
  );

  // The active strategy is owned here (not in the chat hook) so the chat
  // screen label stays visible even if the daemon run completes or errors.
  const [activeStrategy, setActiveStrategy] = useState<StrategyOption | null>(
    null,
  );

  // When a run is loaded from disk, the chat hook surfaces its strategy
  // name/path. Synthesize a StrategyOption from that so the `/chat` route
  // renders the loaded transcript instead of falling back to IntroPage.
  const effectiveActiveStrategy = useMemo<StrategyOption | null>(() => {
    if (activeStrategy) return activeStrategy;
    if (chat.strategyName) {
      return {
        label: chat.strategyName,
        value: chat.strategyPath ?? chat.strategyName,
        description: chat.readOnly ? "loaded run" : "",
      };
    }
    return null;
  }, [activeStrategy, chat.strategyName, chat.strategyPath, chat.readOnly]);

  const handleStartChat = useCallback(
    (strategyPath: string, inputText: string): void => {
      const option = resolveStrategyOption(strategyPath, strategies);
      if (option) {
        setActiveStrategy(option);
      }
      chat.startStrategy(
        strategyPath,
        inputText,
        process.cwd(),
        option?.manifestPath,
      );
      navigate("/chat");
    },
    [chat, navigate, strategies],
  );

  const handleReplySubmit = useCallback(
    (submittedText: string): void => {
      chat.sendInput(submittedText);
    },
    [chat],
  );

  const handlePermissionDecide = useCallback(
    (decisionValue: "allow" | "deny" | "allow-session" | "deny-session"): void => {
      chat.sendPermissionDecision(decisionValue);
    },
    [chat],
  );

  const handleResetChat = useCallback((): void => {
    chat.reset();
    setActiveStrategy(null);
    // The `/chat` route renders <IntroPage /> as its fallback when no
    // active strategy is set — navigating there (rather than to a route
    // that doesn't exist) makes the prompt visible again.
    navigate("/chat");
  }, [chat, navigate]);

  const handleExitApp = useCallback((): void => {
    chat.reset();
    exit();
  }, [chat, exit]);

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
      // Tab shortcuts — only active when on a tabbed route (not /intro).
      if (keyPress.meta && inputText === "1") navigate("/chat");
      if (keyPress.meta && inputText === "2") navigate("/logs");
      if (keyPress.meta && inputText === "3" && devMode) navigate("/dev");
    },
    { isActive: RAW_MODE_SUPPORTED },
  );

  // Auto-start with `--input`: fire once on mount AFTER strategy discovery
  // resolves. `strategies` starts empty and populates asynchronously, so we
  // wait for the first non-empty value before launching.
  const [autoStartFired, setAutoStartFired] = useState(false);
  useEffect(() => {
    if (!initialInput || autoStartFired || strategies.length === 0) return;
    const strategyPath = preselectedStrategy
      ? resolveStrategyOption(preselectedStrategy, strategies)?.value
      : strategies[0]?.value;
    if (!strategyPath) return;
    setAutoStartFired(true);
    handleStartChat(strategyPath, initialInput);
  }, [
    autoStartFired,
    handleStartChat,
    initialInput,
    preselectedStrategy,
    strategies,
  ]);

  return (
    <AppRender
      tabs={tabs}
      activeTabPath={location.pathname}
      onTabSelect={handleTabSelect}
      activeStrategy={effectiveActiveStrategy}
      chatMessages={chat.messages}
      chatStatus={chat.status}
      chatError={chat.error}
      chatPendingInputAgent={chat.pendingInputAgent}
      chatPendingPermissionRequest={chat.pendingPermissionRequest}
      chatPendingQuestionRequest={chat.pendingQuestionRequest}
      onStartChat={handleStartChat}
      onReplySubmit={handleReplySubmit}
      onPermissionDecide={handlePermissionDecide}
      onQuestionSubmit={chat.sendQuestionResponse}
      logs={logs}
      onClearLogs={clearLogs}
      strategies={strategies}
      commandPaletteOpen={commandPalette.isOpen}
      onCommandPaletteClose={commandPalette.close}
      onExitApp={handleExitApp}
      onResetChat={handleResetChat}
    />
  );
}

export function AppRender({
  tabs,
  activeTabPath,
  onTabSelect,
  activeStrategy,
  chatMessages,
  chatStatus,
  chatError,
  chatPendingInputAgent,
  chatPendingPermissionRequest,
  chatPendingQuestionRequest,
  onStartChat,
  onReplySubmit,
  onPermissionDecide,
  onQuestionSubmit,
  logs,
  onClearLogs,
  strategies,
  commandPaletteOpen,
  onCommandPaletteClose,
  onExitApp,
  onResetChat,
}: AppRenderProps): React.ReactElement {
  // /intro renders without the Frame tab bar.
  return (
    <>
      <Frame tabs={tabs} activeTabPath={activeTabPath} onTabSelect={onTabSelect}>
        <Routes>
          <Route
            path="/chat"
            element={
              activeStrategy ? (
                <ChatPage
                  messages={chatMessages}
                  chatStatus={chatStatus}
                  error={chatError}
                  pendingInputAgent={chatPendingInputAgent}
                  pendingPermissionRequest={chatPendingPermissionRequest}
                  pendingQuestionRequest={chatPendingQuestionRequest}
                  onReplySubmit={onReplySubmit}
                  onPermissionDecide={onPermissionDecide}
                  onQuestionSubmit={onQuestionSubmit}
                  activeStrategy={activeStrategy}
                />
              ) : (
                <IntroPage strategies={strategies} onSubmit={onStartChat} />
              )
            }
          />
          <Route
            path="/logs"
            element={<LogsPage logs={logs} onClear={onClearLogs} />}
          />
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
