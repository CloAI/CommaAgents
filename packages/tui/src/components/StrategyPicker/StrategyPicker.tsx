import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { useStrategyPickerTheme } from "./StrategyPicker.theme";

/** A selectable strategy entry. */
export interface StrategyOption {
  readonly label: string;
  readonly value: string;
  readonly description: string;
}

export interface StrategyPickerProps {
  readonly strategies: readonly StrategyOption[];
  readonly onSelect: (strategyPath: string) => void;
}

export interface StrategyPickerRenderProps {
  readonly items: readonly { label: string; value: string }[];
  readonly theme: ReturnType<typeof useStrategyPickerTheme>;
  readonly onSelect: (item: { label: string; value: string }) => void;
}

/**
 * Renders a strategy selection menu.
 * Calls `onSelect` with the chosen strategy's value (path key).
 */
export function StrategyPicker({
  strategies,
  onSelect,
}: StrategyPickerProps): React.ReactElement {
  const theme = useStrategyPickerTheme();

  const items = strategies.map((strategy) => ({
    label: `${strategy.label}  ${strategy.description}`,
    value: strategy.value,
  }));

  const handleSelect = (item: { label: string; value: string }) => {
    onSelect(item.value);
  };

  return (
    <StrategyPickerRender items={items} theme={theme} onSelect={handleSelect} />
  );
}

export function StrategyPickerRender({
  items,
  theme,
  onSelect,
}: StrategyPickerRenderProps): React.ReactElement {
  return (
    <Box {...theme.container}>
      <Text {...theme.heading}>Choose a strategy:</Text>
      <Box {...theme.selectWrapper}>
        <SelectInput items={items} onSelect={onSelect} />
      </Box>
    </Box>
  );
}
