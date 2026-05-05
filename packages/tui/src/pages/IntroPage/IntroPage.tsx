import { Box, useFocusManager } from "ink";
import type React from "react";
import { useEffect } from "react";
import { ChatTextArea } from "../../components";
import type { StrategyOption } from "../../components/StrategyPicker";
import { TitleIcon } from "../../components/TitleIcon";
import type { IntroPageTheme } from "./IntroPage.theme";
import { useIntroPageTheme } from "./IntroPage.theme";

export interface IntroPageProps {
  /** Strategies the user can cycle through with Tab in the input. */
  readonly strategies: readonly StrategyOption[];
  /**
   * Called when the user submits their first prompt. Receives the selected
   * strategy key and the raw input text. The host (App) is responsible for
   * navigating to the chat screen and opening the daemon run.
   */
  readonly onSubmit: (strategyKey: string, input: string) => void;
}

export function IntroPage({
  strategies,
  onSubmit,
}: IntroPageProps): React.ReactElement {
  const theme = useIntroPageTheme();

  return (
    <IntroPageRender
      theme={theme}
      strategies={strategies}
      onSubmit={onSubmit}
    />
  );
}

export interface IntroPageRenderProps {
  /** Resolved theme style objects. */
  readonly theme: IntroPageTheme;
  /** Strategies to expose to the input's strategy switcher. */
  readonly strategies: readonly StrategyOption[];
  /** Submit handler — `(strategyKey, input)`. */
  readonly onSubmit: (strategyKey: string, input: string) => void;
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
      <TitleIcon />
      <ChatTextArea
        strategies={strategies}
        onSubmit={onSubmit}
        width="75%"
        placeholder="Enter your prompt..."
        id="chat"
      />
    </Box>
  );
}
