import type { DiscoveredStrategy } from "@comma-agents/core";
import { Box, useFocusManager } from "ink";
import React, { useEffect } from "react";
import { useNavigate } from "react-router";
import { ChatTextArea } from "../../components";
import type { ChatTextAreaProps } from "../../components/ChatTextArea/ChatTextArea";
import { TitleIcon } from "../../components/TitleIcon";
import { useChatRunLifecycle } from "../../hooks/useChat";
import { useDiscoveredStrategies } from "../../hooks/useStrategies/useStrategies";
import type { IntroPageTheme } from "./IntroPage.theme";
import { useIntroPageTheme } from "./IntroPage.theme";

export function IntroPage(): React.ReactElement {
  const theme = useIntroPageTheme();
  const navigate = useNavigate();
  const { startStrategy } = useChatRunLifecycle();

  const strategies = useDiscoveredStrategies();
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
      onSubmit={handleStartChat}
    />
  );
}

export interface IntroPageRenderProps {
  /** Resolved theme style objects. */
  readonly theme: IntroPageTheme;
  /** Strategies to expose to the input's strategy switcher. */
  readonly strategies: readonly DiscoveredStrategy[];
  /** Submit handler — `(strategyKey, input)`. */
  readonly onSubmit: ChatTextAreaProps["onSubmit"];
}

export function IntroPageRender({
  theme,
  strategies,
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
        id="chat"
      />
    </Box>
  );
}
