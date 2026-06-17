import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { useTheme } from "../../theme";

/** A selectable item. */
export interface SelectItem<Value> {
  readonly label: string;
  readonly value: Value;
  /** Optional dim hint shown after the label. */
  readonly hint?: string;
}

export interface SelectListProps<Value> {
  readonly items: ReadonlyArray<SelectItem<Value>>;
  /** Fired when an item is activated (Enter). */
  readonly onSelect: (value: Value) => void;
  /** Fired when the highlighted item changes. */
  readonly onHighlight?: (value: Value) => void;
  /** Disable input handling when false. Defaults to true. */
  readonly isActive?: boolean;
  /** Message shown when there are no items. */
  readonly emptyMessage?: string;
}

/**
 * A minimal keyboard-navigable list: ↑/↓ (or j/k) to move, Enter to select.
 * Container + render are co-located given its small size.
 */
export function SelectList<Value>({
  items,
  onSelect,
  onHighlight,
  isActive = true,
  emptyMessage = "Nothing here yet.",
}: SelectListProps<Value>) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const clamped = Math.min(index, Math.max(0, items.length - 1));

  useInput(
    (input, key) => {
      if (items.length === 0) return;
      if (key.downArrow || input === "j") {
        const next = (clamped + 1) % items.length;
        setIndex(next);
        onHighlight?.(items[next]!.value);
      } else if (key.upArrow || input === "k") {
        const next = (clamped - 1 + items.length) % items.length;
        setIndex(next);
        onHighlight?.(items[next]!.value);
      } else if (key.return) {
        onSelect(items[clamped]!.value);
      }
    },
    { isActive },
  );

  if (items.length === 0) {
    return <Text color={theme.colors.muted}>{emptyMessage}</Text>;
  }

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const selected = i === clamped;
        return (
          <Box key={`${item.label}-${i}`}>
            <Text color={selected ? theme.colors.primary : theme.colors.muted}>
              {selected ? "❯ " : "  "}
            </Text>
            <Text
              color={selected ? theme.colors.primary : undefined}
              bold={selected && theme.typography.labelBold}
            >
              {item.label}
            </Text>
            {item.hint ? (
              <Text color={theme.colors.muted}> {item.hint}</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
