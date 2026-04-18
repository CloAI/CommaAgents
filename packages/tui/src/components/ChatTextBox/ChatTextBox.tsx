import { Box, Text, useInput } from "ink";
import { useCallback, useState } from "react";

import { useDebugRender } from "../../hooks/useDebugRender";
import { useChatTextBoxTheme } from "./ChatTextBox.theme";

export interface ChatTextBoxProps {
  /** Placeholder shown when input is empty. */
  readonly placeholder?: string;
  /** Called when the user presses Enter with non-empty text. */
  readonly onSubmit: (text: string) => void;
  /** Whether the input is active/focused. */
  readonly isActive?: boolean;
  /** Short strategy name shown before the input (e.g. "Plan"). */
  readonly strategyLabel: string;
  /** Called when the user presses Tab to cycle to the next strategy. */
  readonly onCycleStrategy: () => void;
}

/**
 * Bordered single-line text input with an inline strategy label.
 *
 * ```
 * ╭───────────────────────────────────────╮
 * │  Plan > Enter your prompt...          │
 * ╰───────────────────────────────────────╯
 *  Tab to switch strategy
 * ```
 *
 * Uses standard Ink `<Box>` / `<Text>` for rendering.
 */
export function ChatTextBox({
  placeholder = "Enter prompt...",
  onSubmit,
  isActive = true,
  strategyLabel,
  onCycleStrategy,
}: ChatTextBoxProps) {
  const debug = useDebugRender("ChatTextBox", { props: { placeholder, isActive, strategyLabel } });
  const theme = useChatTextBoxTheme();
  const [value, setValue] = useState("");
  const [cursorOffset, setCursorOffset] = useState(0);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
      setValue("");
      setCursorOffset(0);
    }
  }, [value, onSubmit]);

  useInput(
    (input, key) => {
      if (key.tab) {
        onCycleStrategy();
        return;
      }

      if (key.return) {
        handleSubmit();
        return;
      }

      if (key.upArrow || key.downArrow || (key.ctrl && input === "c")) {
        return;
      }

      if (key.leftArrow) {
        setCursorOffset((prev) => Math.max(0, prev - 1));
      } else if (key.rightArrow) {
        setCursorOffset((prev) => Math.min(value.length, prev + 1));
      } else if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          setValue((prev) => prev.slice(0, cursorOffset - 1) + prev.slice(cursorOffset));
          setCursorOffset((prev) => prev - 1);
        }
      } else if (input && !key.ctrl && !key.meta) {
        setValue((prev) => prev.slice(0, cursorOffset) + input + prev.slice(cursorOffset));
        setCursorOffset((prev) => prev + input.length);
      }
    },
    { isActive },
  );

  const { chars } = theme;

  return (
    <Box ref={debug.ref} {...theme.container}>
      {/* Top border */}
      <Text {...theme.border}>
        {chars.topLeft}
        {chars.horizontal.repeat(60)}
        {chars.topRight}
      </Text>

      {/* Input row */}
      <Box {...theme.innerRow}>
        <Text {...theme.borderSide}>{chars.vertical}</Text>
        <Text {...theme.strategyLabel}> {strategyLabel}</Text>
        <Text {...theme.separator}> {">"} </Text>
        <InputDisplay
          value={value}
          cursorOffset={cursorOffset}
          placeholder={placeholder}
          isActive={isActive}
        />
        <Text {...theme.borderSide}>{chars.vertical}</Text>
      </Box>

      {/* Bottom border */}
      <Text {...theme.border}>
        {chars.bottomLeft}
        {chars.horizontal.repeat(60)}
        {chars.bottomRight}
      </Text>

      {/* Hint */}
      <Text dimColor> Tab to switch strategy</Text>
    </Box>
  );
}

interface InputDisplayProps {
  /** Current input value. */
  readonly value: string;
  /** Cursor position within the value. */
  readonly cursorOffset: number;
  /** Placeholder text. */
  readonly placeholder: string;
  /** Whether the input is focused. */
  readonly isActive: boolean;
}

/** Renders the input text with an inverse cursor. */
function InputDisplay({ value, cursorOffset, placeholder, isActive }: InputDisplayProps) {
  if (value.length === 0) {
    if (isActive) {
      const first = placeholder[0] ?? " ";
      const rest = placeholder.slice(1);
      return (
        <Text>
          <Text inverse>{first}</Text>
          <Text dimColor>{rest}</Text>
        </Text>
      );
    }
    return <Text dimColor>{placeholder}</Text>;
  }

  if (!isActive) {
    return <Text>{value}</Text>;
  }

  const before = value.slice(0, cursorOffset);
  const cursorChar = cursorOffset < value.length ? value[cursorOffset] : " ";
  const after = cursorOffset < value.length ? value.slice(cursorOffset + 1) : "";

  return (
    <Text>
      {before}
      <Text inverse>{cursorChar}</Text>
      {after}
    </Text>
  );
}
