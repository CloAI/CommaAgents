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
import type { ChatMessage, ChatStatus } from "../hooks";
import { useChat } from "../hooks";
import type { LogEntry } from "../hooks/useLogs";
import { useLogs } from "../hooks/useLogs";
import { useModal } from "../hooks/useModal";
import { ChatPage } from "../pages/ChatPage";
import { IntroPage } from "../pages/IntroPage";
import { LogsPage } from "../pages/LogsPage";
import { discoverStrategies } from "../strategy-discovery";

/** Whether stdin supports raw mode (false in piped/non-TTY contexts). */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/** Modal id for the command palette. */
const COMMAND_PALETTE_MODAL_ID = "command-palette";

/** Look up a `StrategyOption` by its path, label, or value, falling back to the first available. */
function resolveStrategyOption(
  strategyKey: string,
  strategies: readonly StrategyOption[],
): StrategyOption | null {
  const matched =
    strategies.find((option) => option.value === strategyKey) ??
    strategies.find((option) => option.label === strategyKey) ??
    strategies.find((option) => option.value.endsWith(`${strategyKey}.json`));
  return matched ?? strategies[0] ?? null;
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
  readonly dev?: boolean;
}

export function App({
  strategy: preselectedStrategy,
  initialInput,
  dev = false,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { enableFocus } = useFocusManager();
  const navigate = useNavigate();
  const location = useLocation();
  const chat = useChat();
  const { logs, clearLogs } = useLogs();
  const commandPalette = useModal(COMMAND_PALETTE_MODAL_ID);

  const strategies = useMemo(() => discoverStrategies(), []);

  // Ensure Ink's focus system is active for tab-order cycling across inputs.
  useEffect(() => {
    enableFocus();
  }, [enableFocus]);

  const tabs = useMemo<readonly TabDefinition[]>(
    () => (dev ? [...BASE_TABS, DEV_TAB] : BASE_TABS),
    [dev],
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
    (strategyPath: string, input: string): void => {
      const option = resolveStrategyOption(strategyPath, strategies);
      if (option) {
        setActiveStrategy(option);
      }
      chat.startStrategy(strategyPath, input, process.cwd(), option?.manifestPath);
      navigate("/chat");
    },
    [chat, navigate, strategies],
  );

  const handleReplySubmit = useCallback(
    (text: string): void => {
      chat.sendInput(text);
    },
    [chat],
  );

  const handlePermissionDecide = useCallback(
    (decision: "allow" | "deny" | "allow-session" | "deny-session"): void => {
      chat.sendPermissionDecision(decision);
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
    (path: string): void => {
      navigate(path);
    },
    [navigate],
  );

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        handleExitApp();
      }
      if (key.ctrl && input === "p") {
        commandPalette.toggle();
      }
      // Tab shortcuts — only active when on a tabbed route (not /intro).
      if (key.meta && input === "1") navigate("/chat");
      if (key.meta && input === "2") navigate("/logs");
      if (key.meta && input === "3" && dev) navigate("/dev");
    },
    { isActive: RAW_MODE_SUPPORTED },
  );

  // Auto-start with `--input`: fire once on mount, then never again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot on mount
  useEffect(() => {
    if (!initialInput) return;
    const strategyPath = preselectedStrategy
      ? resolveStrategyOption(preselectedStrategy, strategies)?.value
      : strategies[0]?.value;
    if (!strategyPath) return;
    handleStartChat(strategyPath, initialInput);
  }, []);

  return (
    <>
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
        onStartChat={handleStartChat}
        onReplySubmit={handleReplySubmit}
        onPermissionDecide={handlePermissionDecide}
        logs={logs}
        onClearLogs={clearLogs}
        strategies={strategies}
      />
      <Modal
        title="Command Palette"
        modalId={COMMAND_PALETTE_MODAL_ID}
        closeOnEsc={false}
        minHeight="60%"
        maxHeight="60%"
      >
        <CommandPalette
          isVisible={commandPalette.isOpen}
          onClose={commandPalette.close}
          onExitApp={handleExitApp}
          onResetChat={handleResetChat}
        />
      </Modal>
      <OutputModal />
    </>
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
  readonly chatPendingPermissionRequest:
    | import("../hooks").PendingPermissionRequest
    | null;
  /** Called when the user submits their first prompt on the intro screen. */
  readonly onStartChat: (strategyKey: string, input: string) => void;
  /** Called when the user replies to an agent on the chat screen. */
  readonly onReplySubmit: (text: string) => void;
  /** Called when the user resolves a permission request. */
  readonly onPermissionDecide: (
    decision: "allow" | "deny" | "allow-session" | "deny-session",
  ) => void;
  /** Captured log entries to display in the Logs tab. */
  readonly logs: readonly LogEntry[];
  /** Called to clear all captured logs. */
  readonly onClearLogs: () => void;
  /** Discovered strategy options from bundled, cwd, and data-dir. */
  readonly strategies: readonly StrategyOption[];
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
  onStartChat,
  onReplySubmit,
  onPermissionDecide,
  logs,
  onClearLogs,
  strategies,
}: AppRenderProps): React.ReactElement {
  // /intro renders without the Frame tab bar.
  return (
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
                onReplySubmit={onReplySubmit}
                onPermissionDecide={onPermissionDecide}
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
  );
}
