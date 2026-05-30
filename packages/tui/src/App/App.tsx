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
import type {
  ChatMessage,
  ChatStatus,
  PendingPermissionRequest,
  PendingQuestionRequest,
} from "../hooks";
import { useChat } from "../hooks";
import type { LogEntry } from "../hooks/useLogs";
import { useLogs } from "../hooks/useLogs";
import { useModal } from "../hooks/useModal";
import { ChatPage } from "../pages/ChatPage";
import { IntroPage } from "../pages/IntroPage";
import { LogsPage } from "../pages/LogsPage";
import { discoverStrategies } from "../strategy-discovery";
import { resolveStrategyOption } from "./App.utils";

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

export interface AppProps {
  /** Pre-select a strategy by key (used together with `initialInput` for auto-start). */
  readonly strategy?: string;
  /** Initial input message — auto-starts a chat on mount when provided. */
  readonly initialInput?: string;
  /** Enable the component playground (Dev tab, Alt+4). */
  readonly devMode?: boolean;
}

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
    (
      decisionValue: "allow" | "deny" | "allow-session" | "deny-session",
    ): void => {
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

export interface AppRenderProps {
  /** Tab definitions to pass to Frame. */
  readonly tabs: readonly TabDefinition[];
  /** Route path of the currently active tab. */
  readonly activeTabPath: string;
  /** Called when a tab is selected. */
  readonly onTabSelect: (path: string) => void;
  /** Active strategy (null when no chat has been started). */
  readonly activeStrategy: StrategyOption | null;
  /** Chat messages — passed through to ChatPage. */
  readonly chatMessages: readonly ChatMessage[];
  /** Chat lifecycle status — passed through to ChatPage. */
  readonly chatStatus: ChatStatus;
  /** Current chat error message, or null. */
  readonly chatError: string | null;
  /** Agent currently waiting for user input, or null. */
  readonly chatPendingInputAgent: string | null;
  /** Pending permission request, or null. */
  readonly chatPendingPermissionRequest: PendingPermissionRequest | null;
  /** Pending question request, or null. */
  readonly chatPendingQuestionRequest: PendingQuestionRequest | null;
  /** Called when the user submits their first prompt on the intro screen. */
  readonly onStartChat: (strategyKey: string, input: string) => void;
  /** Called when the user replies to an agent on the chat screen. */
  readonly onReplySubmit: (text: string) => void;
  /** Called when the user resolves a permission request. */
  readonly onPermissionDecide: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  /** Called when the user submits an answer to a question. */
  readonly onQuestionSubmit: (response: string) => void;
  /** Captured log entries to display in the Logs tab. */
  readonly logs: readonly LogEntry[];
  /** Called to clear all captured logs. */
  readonly onClearLogs: () => void;
  /** Discovered strategy options from bundled, cwd, and data-dir. */
  readonly strategies: readonly StrategyOption[];
  /** Whether the command palette is currently visible. */
  readonly commandPaletteOpen: boolean;
  /** Called when the command palette should be closed. */
  readonly onCommandPaletteClose: () => void;
  /** Called to exit the application entirely. */
  readonly onExitApp: () => void;
  /** Called to reset the chat state and return to the intro screen. */
  readonly onResetChat: () => void;
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
      <Frame
        tabs={tabs}
        activeTabPath={activeTabPath}
        onTabSelect={onTabSelect}
      >
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
