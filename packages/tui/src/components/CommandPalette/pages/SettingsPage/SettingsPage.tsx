import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useState } from "react";

import { useUserConfig } from "../../../../hooks/useUserConfig";
import { THEME_REGISTRY, type ThemeName } from "../../../../Theme/themes";
import { useTheme } from "../../../../Theme/useTheme";
import { ScrollableList } from "../../../ScrollableList";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

interface ThemeOption {
  readonly name: ThemeName;
  readonly label: string;
  readonly description: string;
}

const THEME_OPTIONS: readonly ThemeOption[] = Array.from(
  THEME_REGISTRY.values(),
).map((entry) => ({
  name: entry.name,
  label: entry.label,
  description: entry.description,
}));

/**
 * Settings sub-page for the command palette.
 *
 * Currently exposes a single setting — the active theme — selected from the
 * theme registry. Selection is committed on Enter so users can preview
 * (highlight) entries with the arrow keys without changing their saved
 * theme until they confirm.
 */
export function SettingsPage({
  focusId,
}: {
  readonly focusId: string;
}): React.ReactElement {
  const tokens = useTheme();
  const { config, updateConfig } = useUserConfig();

  const initialIndex = Math.max(
    0,
    THEME_OPTIONS.findIndex((option) => option.name === config.themeName),
  );
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const { isFocused } = useFocus({
    id: focusId,
    isActive: RAW_MODE_SUPPORTED,
  });

  function applySelection(index: number): void {
    const option = THEME_OPTIONS[index];
    if (option === undefined) return;
    updateConfig({ themeName: option.name });
  }

  useInput(
    (_input, key) => {
      if (key.return) {
        applySelection(selectedIndex);
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection="column" width="100%" height="100%" gap={1}>
      <Box marginBottom={1}>
        <Text bold color={tokens.colors.primary}>
          Theme
        </Text>
      </Box>
      <Box flexGrow={1} overflow="hidden">
        <ScrollableList
          items={THEME_OPTIONS}
          getKey={(option) => option.name}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          onSelected={(_option, index) => applySelection(index)}
          isFocused={isFocused}
          emptyText="No themes available"
          renderItem={(option, isSelected) => {
            const isActive = option.name === config.themeName;
            return (
              <Box
                flexDirection="row"
                paddingX={1}
                backgroundColor={isSelected ? tokens.colors.surface : undefined}
              >
                <Box width={20} flexShrink={0}>
                  <Text
                    bold={isSelected}
                    color={
                      isActive ? tokens.colors.success : tokens.colors.primary
                    }
                  >
                    {isActive ? "● " : "  "}
                    {option.label}
                  </Text>
                </Box>
                <Text color={tokens.colors.muted}>{option.description}</Text>
              </Box>
            );
          }}
        />
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>Enter to apply · Esc to go back</Text>
      </Box>
    </Box>
  );
}
