import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

import { useStrategyPickerTheme } from "./StrategyPicker.theme";

/** A selectable strategy entry. */
export interface StrategyOption {
  readonly label: string;
  readonly value: string;
  readonly description: string;
}

interface StrategyPickerProps {
  readonly strategies: readonly StrategyOption[];
  readonly onSelect: (strategyPath: string) => void;
}

/**
 * Renders a strategy selection menu.
 * Calls `onSelect` with the chosen strategy's value (path key).
 */
export function StrategyPicker({ strategies, onSelect }: StrategyPickerProps) {
  const theme = useStrategyPickerTheme();

  const items = strategies.map((strategy) => ({
    label: `${strategy.label}  ${strategy.description}`,
    value: strategy.value,
  }));

  const handleSelect = (item: { label: string; value: string }) => {
    onSelect(item.value);
  };

  return (
    <Box {...theme.container}>
      <Text {...theme.heading}>Choose a strategy:</Text>
      <Box {...theme.selectWrapper}>
        <SelectInput items={items} onSelect={handleSelect} />
      </Box>
    </Box>
  );
}
