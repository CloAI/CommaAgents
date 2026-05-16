import { Box, Text } from "ink";
import type React from "react";

import { BorderedPanel } from "../../BorderedPanel";
import { useMessageListTheme } from "../MessageList.theme";

export interface SystemMessageProps {
  /** Body of the system message. */
  readonly text: string;
}

/**
 * Renders a single system-authored message inside a bordered panel.
 *
 * Surfaces strategy lifecycle events, step started/completed notifications,
 * and surfaced errors. The panel header is fixed to "system" so the role
 * is unambiguous in the scrollback.
 */
export function SystemMessage({
  text,
}: SystemMessageProps): React.ReactElement {
  const theme = useMessageListTheme();
  return <SystemMessageRender theme={theme} text={text} />;
}

export interface SystemMessageRenderProps {
  /** Resolved MessageList theme styles. */
  readonly theme: ReturnType<typeof useMessageListTheme>;
  /** Body of the system message. */
  readonly text: string;
}

export function SystemMessageRender({
  theme,
  text,
}: SystemMessageRenderProps): React.ReactElement {
  const styles = theme.systemMessage;
  return (
    <Box flexDirection="column" marginBottom={styles.container.marginBottom}>
      <BorderedPanel
        header="system"
        borderColor={styles.borderColor}
        headerColor={styles.text.color}
      >
        <Text {...styles.text}>{text}</Text>
      </BorderedPanel>
    </Box>
  );
}
