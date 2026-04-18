import { join } from "node:path";
import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useState } from "react";

/** Whether stdin supports raw mode (false in piped/non-TTY contexts). */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

import { ChatTextBox, MessageList, StatusBar } from "./components";
import type { AppTheme } from "./components/App.theme";
import { useAppTheme } from "./components/App.theme";
import { useDebugRender } from "./hooks/useDebugRender";
import { Frame } from "./components/Frame";
import { BUILT_IN_STRATEGIES } from "./components/StrategyPicker/StrategyPicker.constants";
import { TitleIcon } from "./components/TitleIcon";
import type { ChatMessage, ChatStatus } from "./hooks";
import { useChat } from "./hooks";

/** Resolve a built-in strategy key to its absolute file path. */
function resolveStrategyPath(key: string): string {
  return join(import.meta.dir, "..", "strategies", `${key}.json`);
}

export interface AppProps {
  /** Pre-select a strategy by key (bypasses picker). */
  readonly strategy?: string;
  /** Initial input message (bypasses first user prompt). */
  readonly initialInput?: string;
}

export function App({ strategy: preselectedStrategy, initialInput }: AppProps) {
  const { exit } = useApp();
  const theme = useAppTheme();
  const chat = useChat();

  // Strategy is always selected — default to index 0.
  const initialIndex = preselectedStrategy
    ? Math.max(
        0,
        BUILT_IN_STRATEGIES.findIndex((s) => s.value === preselectedStrategy),
      )
    : 0;

  const [strategyIndex, setStrategyIndex] = useState(initialIndex);
  const currentStrategy = BUILT_IN_STRATEGIES[strategyIndex] ?? BUILT_IN_STRATEGIES[0];

  if (!currentStrategy) {
    throw new Error("BUILT_IN_STRATEGIES is empty — at least one strategy is required");
  }

  // Whether we've started a chat session (submitted at least one message).
  const hasStarted = chat.status !== "idle";

  const handleCycleStrategy = useCallback(() => {
    const nextIndex = (strategyIndex + 1) % BUILT_IN_STRATEGIES.length;
    setStrategyIndex(nextIndex);

    // If mid-chat, reset so the new strategy takes effect on next submit.
    if (hasStarted) {
      chat.reset();
    }
  }, [strategyIndex, hasStarted, chat]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        chat.reset();
        exit();
      }
      if (key.ctrl && input === "r") {
        chat.reset();
      }
    },
    { isActive: RAW_MODE_SUPPORTED },
  );

  const handleSubmit = useCallback(
    (text: string) => {
      if (!hasStarted) {
        // First message — start strategy.
        const strategyPath = resolveStrategyPath(currentStrategy.value);
        chat.startStrategy(strategyPath, text);

        if (initialInput && text !== initialInput) {
          // If initialInput was provided but user typed something different, honour what they typed.
        }
      } else {
        chat.sendInput(text);
      }
    },
    [hasStarted, currentStrategy, chat, initialInput],
  );

  // Auto-start with initialInput if provided.
  const [autoStarted, setAutoStarted] = useState(false);
  if (initialInput && !autoStarted && !hasStarted) {
    setAutoStarted(true);
    const strategyPath = resolveStrategyPath(currentStrategy.value);
    chat.startStrategy(strategyPath, initialInput);
  }

  return (
    <AppRender
      theme={theme}
      strategyLabel={currentStrategy.label}
      onCycleStrategy={handleCycleStrategy}
      messages={chat.messages}
      chatStatus={chat.status}
      error={chat.error}
      pendingInputAgent={chat.pendingInputAgent}
      strategyDescription={currentStrategy.description}
      onSubmit={handleSubmit}
    />
  );
}

export interface AppRenderProps {
  /** Resolved theme style objects. */
  readonly theme: AppTheme;
  /** Current strategy short label (e.g. "Plan"). */
  readonly strategyLabel: string;
  /** Current strategy description for the header. */
  readonly strategyDescription: string;
  /** Called when Tab cycles the strategy. */
  readonly onCycleStrategy: () => void;
  /** Chat messages to display. */
  readonly messages: readonly ChatMessage[];
  /** Current chat lifecycle status. */
  readonly chatStatus: ChatStatus;
  /** Current error message, or null. */
  readonly error: string | null;
  /** Agent waiting for user input, or null. */
  readonly pendingInputAgent: string | null;
  /** Called when the user submits a message. */
  readonly onSubmit: (text: string) => void;
}

export function AppRender({
  theme,
  strategyLabel,
  strategyDescription,
  onCycleStrategy,
  messages,
  chatStatus,
  error,
  pendingInputAgent,
  onSubmit,
}: AppRenderProps) {
  const debug = useDebugRender("AppRender", { props: { strategyLabel, chatStatus, messages, error } });
  const hasStarted = chatStatus !== "idle";

  if (!hasStarted) {
    return (
      <Frame>
        <Box {...theme.pickerScreen}>
          <TitleIcon />
          <ChatTextBox
            strategyLabel={strategyLabel}
            onCycleStrategy={onCycleStrategy}
            placeholder="Enter your prompt..."
            onSubmit={onSubmit}
          />
        </Box>
      </Frame>
    );
  }

  const showInput = chatStatus === "waiting_input";

  return (
    <Frame
      footer={
        <>
          {showInput ? (
            <ChatTextBox
              strategyLabel={strategyLabel}
              onCycleStrategy={onCycleStrategy}
              placeholder={
                pendingInputAgent ? `Reply to ${pendingInputAgent}...` : "Type your message..."
              }
              onSubmit={onSubmit}
              isActive={showInput}
            />
          ) : null}

          {/* Status */}
          <StatusBar status={chatStatus} error={error} strategyName={strategyLabel} />

          {/* Footer */}
          <Box {...theme.footer}>
            <Text {...theme.footer.text}>ctrl+c exit | ctrl+r reset</Text>
          </Box>
        </>
      }
    >
      <Box ref={debug.ref} {...theme.root}>
        {/* Header */}
        <Box {...theme.header}>
          <Text {...theme.header.title}>{strategyLabel}</Text>
          <Text {...theme.header.description}> — {strategyDescription}</Text>
        </Box>

        {/* Separator */}
        <Box {...theme.separator}>
          <Text {...theme.separator.text}>{theme.separator.content}</Text>
        </Box>

        {/* Messages */}
        <Box {...theme.messageArea}>
          <MessageList messages={messages} />
        </Box>

        {/* Separator */}
        <Box {...theme.separator}>
          <Text {...theme.separator.text}>{theme.separator.content}</Text>
        </Box>
      </Box>
    </Frame>
  );
}
