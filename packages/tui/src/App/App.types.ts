import type { TabDefinition } from "../components/Frame/Frame";
import type { StrategyOption } from "../components/StrategyPicker";
import type {
  ChatMessage,
  ChatStatus,
  PendingPermissionRequest,
  PendingQuestionRequest,
} from "../hooks";
import type { LogEntry } from "../hooks/useLogs";

/** Spread-ready style objects for the App component. */
export interface AppTheme {
  /** Root container (column layout, full height). */
  readonly root: {
    readonly flexDirection: "column";
    readonly height: "100%";
  };
}

export interface AppProps {
  /** Pre-select a strategy by key (used together with `initialInput` for auto-start). */
  readonly strategy?: string;
  /** Initial input message — auto-starts a chat on mount when provided. */
  readonly initialInput?: string;
  /** Enable the component playground (Dev tab, Alt+4). */
  readonly devMode?: boolean;
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
