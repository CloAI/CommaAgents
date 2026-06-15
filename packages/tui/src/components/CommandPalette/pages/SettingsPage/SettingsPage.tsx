import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useState } from "react";

import { useUserConfig } from "../../../../hooks/useUserConfig";
import { THEME_REGISTRY, type ThemeName } from "../../../../Theme/themes";
import { useTheme } from "../../../../Theme/useTheme";
import { ScrollableList } from "../../../ScrollableList";

export const RAW_MODE_SUPPORTED =
  typeof process.stdin.setRawMode === "function";

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

export interface SettingsPageProps {
  /** Unique identifier for the focusable area. */
  readonly focusId: string;
}

export function SettingsPage({
  focusId,
}: SettingsPageProps): React.ReactElement {
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

  const applySelection = React.useCallback(
    (index: number): void => {
      const option = THEME_OPTIONS[index];
      if (option === undefined) return;
      updateConfig({ themeName: option.name });
    },
    [updateConfig],
  );

  useInput(
    (_input, key) => {
      if (key.return) {
        applySelection(selectedIndex);
      }
    },
    { isActive: isFocused },
  );

  return (
    <SettingsPageRender
      tokens={tokens}
      config={config}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={setSelectedIndex}
      onSelected={applySelection}
      isFocused={isFocused}
    />
  );
}

export interface SettingsPageRenderProps {
  /** Theme tokens for styling. */
  readonly tokens: ReturnType<typeof useTheme>;
  /** Current user configuration. */
  readonly config: ReturnType<typeof useUserConfig>["config"];
  /** Currently highlighted index in the theme list. */
  readonly selectedIndex: number;
  /** Callback when a new index is highlighted. */
  readonly onSelectedIndexChange: (index: number) => void;
  /** Callback when a theme is selected. */
  readonly onSelected: (index: number) => void;
  /** Whether the page is currently focused. */
  readonly isFocused: boolean;
}

export function SettingsPageRender({
  tokens,
  config,
  selectedIndex,
  onSelectedIndexChange,
  onSelected,
  isFocused,
}: SettingsPageRenderProps): React.ReactElement {
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
          onSelectedIndexChange={onSelectedIndexChange}
          onSelected={(_option, index) => onSelected(index)}
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
