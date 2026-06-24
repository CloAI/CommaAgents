import type { DiscoveredStrategy } from "@comma-agents/core";
import { Box, useFocusManager } from "ink";
import React, { useEffect } from "react";
import { useNavigate } from "react-router";
import { ChatTextArea } from "../../components";
import type { ChatTextAreaProps } from "../../components/ChatTextArea/ChatTextArea";
import { TitleIcon } from "../../components/TitleIcon";
import { useChatRunLifecycle } from "../../hooks/useChat";
import {
  useDiscoveredStrategies,
  useStrategyDiscoveryStatus,
} from "../../hooks/useStrategies/useStrategies";
import type { IntroPageTheme } from "./IntroPage.theme";
import { useIntroPageTheme } from "./IntroPage.theme";

function getEmptyStrategyLabel(
  status: ReturnType<typeof useStrategyDiscoveryStatus>["status"],
): string {
  if (status === "loading") return "Loading strategies...";
  return "No strategies found";
}

function getEmptyStrategyPlaceholder(
  status: ReturnType<typeof useStrategyDiscoveryStatus>["status"],
  error: string | null,
): string {
  if (status === "loading") return "Loading...";
  if (error) return error;
  return "No bundled or user strategies were found.";
}

export function IntroPage(): React.ReactElement {
  const theme = useIntroPageTheme();
  const navigate = useNavigate();
  const { startStrategy } = useChatRunLifecycle();

  const strategies = useDiscoveredStrategies();
  const strategyDiscovery = useStrategyDiscoveryStatus();
  const handleStartChat = React.useCallback<ChatTextAreaProps["onSubmit"]>(
    (strategy: DiscoveredStrategy, inputText: string): void => {
      const chatRunId = startStrategy(
        strategy.path,
        inputText,
        process.cwd(),
        strategy.manifestPath,
      );
      navigate(`/chat/${encodeURIComponent(chatRunId)}`);
    },
    [navigate, startStrategy],
  );

  return (
    <IntroPageRender
      theme={theme}
      strategies={strategies}
      emptyStrategyLabel={getEmptyStrategyLabel(strategyDiscovery.status)}
      emptyStrategyPlaceholder={getEmptyStrategyPlaceholder(
        strategyDiscovery.status,
        strategyDiscovery.error,
      )}
      onSubmit={handleStartChat}
    />
  );
}

export interface IntroPageRenderProps {
  /** Resolved theme style objects. */
  readonly theme: IntroPageTheme;
  /** Strategies to expose to the input's strategy switcher. */
  readonly strategies: readonly DiscoveredStrategy[];
  /** Label shown when no strategies are available yet. */
  readonly emptyStrategyLabel: string;
  /** Prompt placeholder shown when no strategies are available yet. */
  readonly emptyStrategyPlaceholder: string;
  /** Submit handler — `(strategyKey, input)`. */
  readonly onSubmit: ChatTextAreaProps["onSubmit"];
}

export function IntroPageRender({
  theme,
  strategies,
  emptyStrategyLabel,
  emptyStrategyPlaceholder,
  onSubmit,
}: IntroPageRenderProps): React.ReactElement {
  const { focus } = useFocusManager();
  useEffect(() => {
    focus("chat");
  }, [focus]);

  return (
    <Box {...theme.root}>
      <Box marginBottom={2}></Box>
      <TitleIcon />
      <Box marginBottom={4}></Box>
      {/* Too lazy for margin and boxing TODO: Do the theme work*/}
      <ChatTextArea
        strategies={strategies}
        onSubmit={onSubmit}
        width="%50"
        placeholder="Enter your prompt..."
        emptyStrategyLabel={emptyStrategyLabel}
        emptyPlaceholder={emptyStrategyPlaceholder}
        id="chat"
      />
    </Box>
  );
}
