import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";

import { useDebugRender } from "../../hooks/useDebugRender";

import type { SearchInputTheme } from "./SearchInput.theme";
import { useSearchInputTheme } from "./SearchInput.theme";
import { isMouseEscape } from "./SearchInput.utils";

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

/**
 * Single-line controlled search input with a rounded border, prompt caret,
 * and placeholder.
 *
 * Typing appends characters; Backspace/Delete removes the last character.
 * Navigation keys (arrows, Enter, Escape) are intentionally not handled so
 * the parent can own list navigation and dismissal.
 *
 * @example
 * ```tsx
 * const [query, setQuery] = useState("");
 * <SearchInput value={query} onChange={setQuery} placeholder="Search..." />
 * ```
 */
export function SearchInput({
  id,
  value,
  onChange,
  placeholder = "Search...",
  prompt = "› ",
}: SearchInputProps): React.ReactElement {
  const debug = useDebugRender("SearchInput", { props: { value, id } });
  const theme = useSearchInputTheme();

  const { isFocused } = useFocus({ id });

  useInput(
    (input, key) => {
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }
      // Ignore control keys that the parent likely wants to handle
      // (arrows, Enter, Escape, Tab). Only accept printable input.
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)
        return;
      if (key.return || key.escape || key.tab) return;
      // Swallow SGR mouse escape sequences (scroll wheel, clicks) so they
      // don't get typed into the query.
      if (input && isMouseEscape(input)) return;
      if (input && !key.ctrl && !key.meta) {
        onChange(value + input);
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box ref={debug.ref} width="100%" flexShrink={0}>
      <SearchInputRender
        theme={theme}
        value={value}
        placeholder={placeholder}
        prompt={prompt}
      />
    </Box>
  );
}

/** Props for the `SearchInputRender` presentational component. */
export interface SearchInputRenderProps {
  /** Resolved theme styles. */
  readonly theme: SearchInputTheme;
  /** Current query value. */
  readonly value: string;
  /** Placeholder text for when the query is empty. */
  readonly placeholder: string;
  /** Prompt character(s) shown before the query. */
  readonly prompt: string;
}

/** Presentational form of `SearchInput`; takes resolved props + theme. */
export function SearchInputRender(
  props: SearchInputRenderProps,
): React.ReactElement {
  const { theme, value, placeholder, prompt } = props;

  return (
    <Box {...theme.inputBorder}>
      <Text {...theme.prompt}>{prompt}</Text>
      {value.length === 0 ? (
        <Text {...theme.placeholder}>{placeholder}</Text>
      ) : (
        <Text {...theme.query}>{value}</Text>
      )}
    </Box>
  );
}
