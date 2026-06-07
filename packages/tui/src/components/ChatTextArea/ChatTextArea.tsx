import type { DiscoveredStrategy } from "@comma-agents/core";
import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextAreaInput } from "../TextAreaInput";
import { useChatTextAreaTheme } from "./ChatTextArea.theme";

/** Props for the ChatTextArea container. */
export interface ChatTextAreaProps {
  /**
   * Stable focus ID for programmatic focusing via `useFocusManager().focus(id)`.
   * When omitted the component still participates in tab-order cycling.
   */
  readonly id?: string;
  /** Available strategies the user can cycle through. */
  readonly strategies: readonly DiscoveredStrategy[];
  /** Strategy path selected when the composer is first shown. */
  readonly initialStrategyPath?: string;
  /** Width — columns (number) or CSS-like string. @default "100%" */
  readonly width?: number | string;
  /** Visible row count for the text area. @default 10 */
  readonly height?: number;
  /** Placeholder shown when the text area is empty. */
  readonly placeholder?: string;
  /**
   * Whether to show the strategy row (label + "Tab to change strategy" hint).
   * Hide it when the strategy is fixed (e.g. steering or replying mid-run).
   * @default true
   */
  readonly showStrategyRow?: boolean;
  /** Called when the user submits a message with the selected strategy. */
  readonly onSubmit: (strategyPath: DiscoveredStrategy, input: string) => void;
}

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
  id,
  strategies,
  initialStrategyPath,
  width = "100%",
  height = 5,
  placeholder = "Enter your prompt...",
  showStrategyRow = true,
  onSubmit,
}: ChatTextAreaProps): React.ReactElement {
  const { isFocused } = useFocus({ id });
  const [inputValue, setInputValue] = useState("");
  const [strategyIndex, setStrategyIndex] = useState(() => {
    const initialIndex = strategies.findIndex(
      (strategy) => strategy.path === initialStrategyPath,
    );
    return initialIndex >= 0 ? initialIndex : 0;
  });
  const appliedInitialStrategyPath = useRef<string | undefined>(
    strategies[strategyIndex]?.path,
  );

  useEffect(() => {
    if (
      initialStrategyPath === undefined ||
      appliedInitialStrategyPath.current === initialStrategyPath
    ) {
      return;
    }
    const initialIndex = strategies.findIndex(
      (strategy) => strategy.path === initialStrategyPath,
    );
    if (initialIndex < 0) return;
    appliedInitialStrategyPath.current = initialStrategyPath;
    setStrategyIndex(initialIndex);
  }, [initialStrategyPath, strategies]);

  const currentStrategy = strategies[strategyIndex] ?? strategies[0];

  // Tab/ctrl+s shortcuts run in the OUTER tree on purpose — they mutate
  // outer state (strategyIndex, inputValue) and we don't want to wait for
  // the detached tree's input forwarding to deliver them. The detached
  // tree gets its own forwarded copy too, but only TextAreaInput's
  // useInput consumes character input there.
  useInput(
    (_input, key) => {
      if (key.tab && showStrategyRow && strategies.length > 0) {
        setStrategyIndex((previous) => (previous + 1) % strategies.length);
      }
    },
    { isActive: isFocused },
  );

  const handleSubmit = useCallback(
    (text: string) => {
      if (!currentStrategy) return;
      setInputValue("");
      onSubmit(currentStrategy, text);
    },
    [currentStrategy, onSubmit],
  );

  if (strategies.length === 0) {
    return (
      <ChatTextAreaRender
        inputValue=""
        onInputChange={() => {}}
        onSubmit={() => {}}
        strategyLabel="Loading..."
        strategyDescription="Loading available strategies..."
        width={width}
        height={height}
        placeholder="Loading..."
        showStrategyRow={showStrategyRow}
        id={id}
      />
    );
  }

  if (!currentStrategy) {
    throw new Error("ChatTextArea requires at least one strategy");
  }

  return (
    <ChatTextAreaRender
      id={id}
      width={width}
      height={height}
      inputValue={inputValue}
      strategyLabel={currentStrategy.label}
      strategyDescription={currentStrategy.description}
      placeholder={placeholder}
      showStrategyRow={showStrategyRow}
      onInputChange={setInputValue}
      onSubmit={handleSubmit}
    />
  );
}

/** Props for the ChatTextArea render function. */
export interface ChatTextAreaRenderProps {
  /**
   * Focus ID forwarded from `ChatTextAreaProps`. Passed through to `TextAreaInput`
   * so both the container's `useInput` (tab/ctrl+s) and the leaf's `useInput`
   * (typing) share a single focus slot.
   */
  readonly id?: string;
  /** Current text input value. */
  readonly inputValue: string;
  /** Label of the currently selected strategy. */
  readonly strategyLabel: string;
  /** Description of the currently selected strategy. */
  readonly strategyDescription: string | undefined;
  /** Width for the text area. */
  readonly width: number | string;
  /** Height for the text area. */
  readonly height: number;
  /** Placeholder text. */
  readonly placeholder: string;
  /** Whether to show the strategy row. */
  readonly showStrategyRow: boolean;
  /** Called when the text input value changes. */
  readonly onInputChange: (value: string) => void;
  /** Called on Meta+Enter with the current text. */
  readonly onSubmit: (text: string) => void;
}

/**
 * Internal render component executed inside the detached Ink instance.
 *
 * Receives a fully-resolved numeric `width` so it does not depend on
 * `useBoxMetrics` measurement inside the detached tree (which would race
 * against the first frame and produce a one-tick layout flash).
 */
export function ChatTextAreaRender({
  id,
  inputValue,
  onInputChange,
  onSubmit,
  strategyLabel,
  strategyDescription,
  width,
  height,
  placeholder,
  showStrategyRow,
}: ChatTextAreaRenderProps): React.ReactElement {
  const theme = useChatTextAreaTheme();

  return (
    <Box {...theme.container} width={width}>
      <TextAreaInput
        value={inputValue}
        onChange={onInputChange}
        width={width}
        height={height}
        placeholder={placeholder}
        onSubmit={onSubmit}
        id={id}
      />
      {showStrategyRow ? (
        <Box {...theme.strategyRow}>
          <Box maxWidth={42}>
            <Text {...theme.strategyLabel}>
              {strategyLabel}
            </Text>
          </Box>
          <Text {...theme.hint}>Tab to change strategy · Enter to submit</Text>
        </Box>
      ) : null}
    </Box>
  );
}
