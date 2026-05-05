/** Props for the `SearchInput` container component. */
export interface SearchInputProps {
  /** Current query string (controlled). */
  readonly value: string;
  /** Called with the new query whenever it changes. */
  readonly onChange: (next: string) => void;
  /** Placeholder shown when `value` is empty. */
  readonly placeholder?: string;
  /** Prompt character rendered at the start of the input. Defaults to `› `. */
  readonly prompt?: string;
  /**
   * Stable focus ID for programmatic focusing via `useFocusManager().focus(id)`.
   * When omitted the component still participates in tab-order cycling.
   */
  readonly id?: string;
}

/** Props for the `SearchInputRender` presentational component. */
export interface SearchInputRenderProps {
  /** Current query value. */
  readonly value: string;
  /** Placeholder text for when the query is empty. */
  readonly placeholder: string;
  /** Prompt character(s) shown before the query. */
  readonly prompt: string;
}
