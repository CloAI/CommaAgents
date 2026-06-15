import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../../../../Theme";

import { SHORTCUTS } from "./HelpPage.constants";

export interface HelpPageProps {
  /** ID of the currently focused element for API consistency. */
  readonly focusId: string;
}

export function HelpPage({
  focusId: _focusId,
}: HelpPageProps): React.ReactElement {
  const tokens = useTheme();

  return <HelpPageRender tokens={tokens} />;
}

export interface HelpPageRenderProps {
  /** The active theme tokens. */
  readonly tokens: ReturnType<typeof useTheme>;
}

export function HelpPageRender({
  tokens,
}: HelpPageRenderProps): React.ReactElement {
  return (
    <Box flexDirection="column" width="100%" gap={1}>
      <Box marginBottom={1}>
        <Text bold color={tokens.colors.primary}>
          Keyboard Shortcuts
        </Text>
      </Box>
      {SHORTCUTS.map((entry) => (
        <Box key={entry.keys} flexDirection="row" gap={2}>
          <Box width={14} flexShrink={0}>
            <Text color={tokens.colors.secondary} bold>
              {entry.keys}
            </Text>
          </Box>
          <Text color={tokens.colors.muted}>{entry.description}</Text>
        </Box>
      ))}
    </Box>
  );
}
