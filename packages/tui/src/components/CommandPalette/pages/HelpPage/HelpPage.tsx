import { Box, Text } from "ink";
import type React from "react";
import { useTheme } from "../../../../theme";

/** A single shortcut entry for the help page. */
interface ShortcutEntry {
  readonly keys: string;
  readonly description: string;
}

const SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: "Ctrl+P", description: "Toggle command palette" },
  { keys: "↑ / ↓", description: "Navigate list items" },
  { keys: "Enter", description: "Select item / confirm" },
  { keys: "Esc", description: "Go back / dismiss" },
  { keys: "Backspace", description: "Delete last character in search" },
  { keys: "Ctrl+C", description: "Quit the application" },
];

/**
 * Help sub-page for the command palette.
 * Lists keyboard shortcuts and brief usage tips.
 * `focusId` is accepted for API consistency but not used (static page).
 */
export function HelpPage(_props: {
  readonly focusId: string;
}): React.ReactElement {
  const tokens = useTheme();

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
