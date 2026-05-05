import { Box, type DOMElement, Text, useBoxMetrics, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useRef, useState } from "react";

import { TextAreaInput } from "../TextAreaInput";
import { useChatTextAreaTheme } from "./ChatTextArea.theme";
import type {
  ChatTextAreaProps,
  ChatTextAreaRenderProps,
} from "./ChatTextArea.types";

/** Whether stdin supports raw mode (false in piped/non-TTY contexts). */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/**
 * Outer-tree shell that measures the available width and hands a numeric
 * column count down to the detached `<DynamicContent>` boundary.
 *
 * Why split: `DynamicContent` requires an exact numeric width because its
 * detached Yoga layout has no parent to inherit flex sizing from. We keep
 * the existing public `width` prop polymorphic (`number | "100%"` etc.) by
 * using a thin outer placeholder whose box metrics give us the resolved
 * column count, then we forward that into the detached tree.
 *
 * The shell also owns the input state (text + strategy index) so that the
 * detached tree only needs to render — not coordinate. State setters cross
 * the boundary via closure; React itself doesn't know they're "outside",
 * because the detached instance is its own root with its own reconciler
 * but the JS closures still work normally.
 */
export function ChatTextArea({
    strategies,
    onSubmit,
    id,
    width = "100%",
    height = 5,
    placeholder = "Enter your prompt...",
  }: ChatTextAreaProps): React.ReactElement {

  const [inputValue, setInputValue] = useState("");
  const [strategyIndex, setStrategyIndex] = useState(0);

  const currentStrategy = strategies[strategyIndex] ?? strategies[0];

  if (!currentStrategy) {
    throw new Error("ChatTextArea requires at least one strategy");
  }

  const handleSubmit = useCallback(
    (text: string) => {
      if (!currentStrategy) return;
      setInputValue("");
      onSubmit(currentStrategy.value, text);
    },
    [currentStrategy, onSubmit],
  );

  const { isFocused } = useFocus({ id, isActive: RAW_MODE_SUPPORTED });

  // Tab/ctrl+s shortcuts run in the OUTER tree on purpose — they mutate
  // outer state (strategyIndex, inputValue) and we don't want to wait for
  // the detached tree's input forwarding to deliver them. The detached
  // tree gets its own forwarded copy too, but only TextAreaInput's
  // useInput consumes character input there.
  useInput(
    (input, key) => {
      if (key.tab) {
        setStrategyIndex((previous) => (previous + 1) % strategies.length);
      }
      if (key.ctrl && input === "s") {
        const trimmed = inputValue.trim();
        if (trimmed) handleSubmit(trimmed);
      }
    },
    { isActive: isFocused && RAW_MODE_SUPPORTED },
  );

  // Measure the rendered shell so we can give DynamicContent a numeric
  // width that matches whatever flex sizing the parent imposed.
  const shellRef = useRef<DOMElement>(null) as React.RefObject<DOMElement>;
  const { width: measuredWidth } = useBoxMetrics(shellRef);

  // Resolve the width to forward into the detached tree:
  //   - If caller passed an explicit number, trust it.
  //   - Otherwise wait until the shell has been measured (>0) and use that.
  const resolvedWidth =
    typeof width === "number" ? width : measuredWidth > 0 ? measuredWidth : 0;

  return (
    <Box ref={shellRef} width={width} flexDirection="column">
      {resolvedWidth > 0 ? (
          <ChatTextAreaRender
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSubmit={handleSubmit}
            strategyLabel={currentStrategy.label}
            strategyDescription={currentStrategy.description}
            width={resolvedWidth}
            height={height}
            placeholder={placeholder}
            id={id}
          />
      ) : null}
    </Box>
  );
}

/**
 * Internal render component executed inside the detached Ink instance.
 *
 * Receives a fully-resolved numeric `width` so it does not depend on
 * `useBoxMetrics` measurement inside the detached tree (which would race
 * against the first frame and produce a one-tick layout flash).
 */
export function ChatTextAreaRender(
  props: ChatTextAreaRenderProps,
): React.ReactElement {
  const {
    inputValue,
    onInputChange,
    onSubmit,
    strategyLabel,
    strategyDescription,
    width,
    height,
    placeholder,
    id
  } = props;

  const theme = useChatTextAreaTheme();

  // Subtract the double border (1 col on each side) so TextAreaInput's
  // own width matches the interior of the borderBox exactly.
  const innerWidth = typeof width === "number" ? Math.max(1, width - 2) : width;

  return (
    <Box {...theme.container} width={width}>
      <Box {...theme.borderBox}>
        <TextAreaInput
          value={inputValue}
          onChange={onInputChange}
          width={innerWidth}
          height={height}
          placeholder={placeholder}
          onSubmit={onSubmit}
          id={id}
        />
      </Box>
      <Box {...theme.strategyRow}>
        <Text>
          <Text {...theme.strategyLabel}>{strategyLabel}</Text>
          <Text {...theme.hint}> — {strategyDescription}</Text>
        </Text>
        <Text {...theme.hint}>tab strategy · ctrl+s submit</Text>
      </Box>
    </Box>
  );
}
