import { Box, Text } from "ink";
import type React from "react";

import { BorderedPanel } from "../../BorderedPanel";
import { useMessageListTheme } from "../MessageList.theme";

export interface UserMessageProps {
  /** The user-typed body of the message. */
  readonly text: string;
  /** Display label for the user (defaults to "you"). */
  readonly label?: string;
}

/**
 * Renders a single user-authored message inside a bordered panel.
 *
 * The panel's top border embeds the user label so the sender is visible
 * without consuming an extra row, and the prompt body is rendered inside
 * the panel's body box.
 */
export function UserMessage({
  text,
  label = "you",
}: UserMessageProps): React.ReactElement {
  const theme = useMessageListTheme();
  return <UserMessageRender theme={theme} text={text} label={label} />;
}

export interface UserMessageRenderProps {
  /** Resolved MessageList theme styles. */
  readonly theme: ReturnType<typeof useMessageListTheme>;
  /** The user-typed body of the message. */
  readonly text: string;
  /** Display label for the user. */
  readonly label: string;
}

export function UserMessageRender({
  theme,
  text,
  label,
}: UserMessageRenderProps): React.ReactElement {
  const styles = theme.userMessage;
  return (
    <Box {...styles.container}>
      <BorderedPanel
        header={label}
        borderColor={styles.borderColor}
        headerColor={styles.label.color}
      >
        <Text {...styles.bodyText}>{text}</Text>
      </BorderedPanel>
    </Box>
  );
}
