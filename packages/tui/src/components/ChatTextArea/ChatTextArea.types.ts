import type { StrategyOption } from "../StrategyPicker";

/** Props for the ChatTextArea container. */
export interface ChatTextAreaProps {
  /** Available strategies the user can cycle through. */
  readonly strategies: readonly StrategyOption[];
  /** Called when the user submits a message with the selected strategy. */
  readonly onSubmit: (strategyPath: string, input: string) => void;
  /**
   * Stable focus ID for programmatic focusing via `useFocusManager().focus(id)`.
   * When omitted the component still participates in tab-order cycling.
   */
  readonly id?: string;
  /** Width — columns (number) or CSS-like string. @default "100%" */
  readonly width?: number | string;
  /** Visible row count for the text area. @default 10 */
  readonly height?: number;
  /** Placeholder shown when the text area is empty. */
  readonly placeholder?: string;
}

/** Props for the ChatTextArea render function. */
export interface ChatTextAreaRenderProps {
  /** Current text input value. */
  readonly inputValue: string;
  /** Called when the text input value changes. */
  readonly onInputChange: (value: string) => void;
  /** Called on Meta+Enter with the current text. */
  readonly onSubmit: (text: string) => void;
  /** Label of the currently selected strategy. */
  readonly strategyLabel: string;
  /** Description of the currently selected strategy. */
  readonly strategyDescription: string;
  /** Width for the text area. */
  readonly width: number | string;
  /** Height for the text area. */
  readonly height: number;
  /** Placeholder text. */
  readonly placeholder: string;
  /**
   * Focus ID forwarded from `ChatTextAreaProps`. Passed through to `TextAreaInput`
   * so both the container's `useInput` (tab/ctrl+s) and the leaf's `useInput`
   * (typing) share a single focus slot.
   */
  readonly id?: string;
}
