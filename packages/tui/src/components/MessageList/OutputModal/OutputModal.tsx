import { Box, type DOMElement, Text, useInput } from "ink";
import type React from "react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { useDebugRender } from "../../../hooks/useDebugRender";
import { useModal } from "../../../hooks/useModal";
import { isInsideRef } from "../../../hooks/useMouse/useMouse.utils";
import { Modal } from "../../Modal";
import { MouseContext } from "../../MouseProvider/MouseContext";
import { ScrollableView } from "../../ScrollableView";
import { SearchInput } from "../../SearchInput";

import {
  OUTPUT_MODAL_EMPTY_LINE,
  OUTPUT_MODAL_ID,
  OUTPUT_MODAL_SEARCH_PLACEHOLDER,
} from "./OutputModal.constants";
import type { OutputModalTheme } from "./OutputModal.theme";
import { useOutputModalTheme } from "./OutputModal.theme";
import type {
  OutputModalLine,
  OutputModalPayload,
  OutputModalQuery,
} from "./OutputModal.types";
import { compileQuery, filterAndHighlight } from "./OutputModal.utils";

/**
 * Modal expansion of a tool-result or thinking segment with regex
 * filter + highlight.
 *
 * Behaviour:
 * - The body is split into lines and rendered verbatim (plain text).
 *   Both `tool-result` and `thinking` use the same renderer here —
 *   markdown rendering happens in the main MessageList view, not in
 *   the modal, so grep semantics line up with what the user sees.
 * - When the search query is empty, every line is shown without
 *   highlighting (fast path).
 * - When the query is a valid regex, only matching lines are kept and
 *   the matching slices are inverse-highlighted in place.
 * - Esc dismisses (handled by the underlying `Modal`); a click outside
 *   the modal content box also dismisses.
 *
 * The modal is a singleton — only one `<OutputModal />` should be
 * mounted at a time, identified by {@link OUTPUT_MODAL_ID}. Open it
 * from anywhere via `useModal(OUTPUT_MODAL_ID).open(payload)`.
 */
export function OutputModal(): React.ReactElement | null {
  useDebugRender("OutputModal", {});
  const theme = useOutputModalTheme();
  const { isOpen, data, close } = useModal(OUTPUT_MODAL_ID);
  const payload = isPayload(data) ? data : null;

  const [query, setQuery] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  useEffect(() => {
    if (isOpen && payload !== null) {
      setQuery("");
      setScrollOffset(0);
    }
  }, [isOpen, payload?.title, payload?.body, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  const compiled = useMemo<OutputModalQuery>(
    () => compileQuery(query),
    [query],
  );
  const lines = useMemo<readonly OutputModalLine[]>(
    () => (payload ? filterAndHighlight(payload.body, compiled.regex) : []),
    [payload?.body, compiled.regex, payload], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const contentRef = useRef<DOMElement | null>(null);
  const mouseContextValue = useContext(MouseContext);
  const subscribe = mouseContextValue?.subscribe;
  useEffect(() => {
    if (!isOpen || !subscribe) return;
    return subscribe((event) => {
      if (event.kind !== "press") return;
      if (event.button !== 0) return;
      if (isInsideRef(contentRef, event.column, event.row)) return;
      close();
    });
  }, [isOpen, subscribe, close]);

  useInput(
    (_input, key) => {
      if (!isOpen) return;
      if (key.upArrow) {
        setScrollOffset((offset) => Math.max(0, offset - 3));
        return;
      }
      if (key.downArrow) {
        setScrollOffset((offset) => offset + 3);
        return;
      }
    },
    { isActive: isOpen },
  );

  if (!isOpen || payload === null) return null;

  return (
    <Modal
      modalId={OUTPUT_MODAL_ID}
      title={titleFor(payload)}
      minHeight={22}
      maxHeight="80%"
    >
      <Box ref={contentRef} {...theme.body}>
        <OutputModalRender
          theme={theme}
          query={compiled}
          lines={lines}
          onQueryChange={setQuery}
          scrollToRow={scrollOffset}
        />
      </Box>
    </Modal>
  );
}

/**
 * Pure render half of {@link OutputModal} — receives a fully-prepared
 * line list and a compiled query, so unit tests can exercise the
 * renderer without going through `useModal`.
 */
export interface OutputModalRenderProps {
  readonly theme: OutputModalTheme;
  readonly query: OutputModalQuery;
  readonly lines: readonly OutputModalLine[];
  readonly onQueryChange: (next: string) => void;
  readonly scrollToRow?: number;
}

export function OutputModalRender({
  theme,
  query,
  lines,
  onQueryChange,
  scrollToRow,
}: OutputModalRenderProps): React.ReactElement {
  const totalMatches = countMatches(lines);
  return (
    <>
      <Box {...theme.searchRow}>
        <SearchInput
          value={query.raw}
          onChange={onQueryChange}
          placeholder={OUTPUT_MODAL_SEARCH_PLACEHOLDER}
        />
      </Box>
      <Box {...theme.statusRow}>
        <Text
          {...(query.invalid ? theme.searchStatusError : theme.searchStatus)}
        >
          {statusText(query, lines.length, totalMatches)}
        </Text>
      </Box>
      {lines.length === 0 ? (
        <Text {...theme.emptyState}>{OUTPUT_MODAL_EMPTY_LINE} no matches</Text>
      ) : (
        <ScrollableView
          items={lines}
          getKey={(line) => String(line.lineNumber)}
          scrollToRow={scrollToRow}
          renderItem={(line) => <LineRow line={line} theme={theme} />}
        />
      )}
    </>
  );
}

interface LineRowProps {
  readonly line: OutputModalLine;
  readonly theme: OutputModalTheme;
}

/**
 * Single line row: faint left-gutter line number followed by the
 * line's segmented text. Each `(text, isMatch)` segment is rendered
 * as a sibling `<Text>` so highlight inversion only affects the
 * matched slice — Ink composes nested `<Text>` runs into one row.
 */
function LineRow({ line, theme }: LineRowProps): React.ReactElement {
  return (
    <Box {...theme.lineRow}>
      <Text
        {...theme.lineNumber}
      >{`${String(line.lineNumber).padStart(4, " ")} `}</Text>
      <Text {...theme.lineText}>
        {line.segments.map((segment, index) =>
          segment.isMatch ? (
            <Text key={index} {...theme.lineMatch}>
              {segment.text}
            </Text>
          ) : (
            <Text key={index}>{segment.text}</Text>
          ),
        )}
      </Text>
    </Box>
  );
}

/**
 * Total number of highlighted slices across all displayed lines.
 *
 * Used by the search-row status text — shows the user how many hits
 * the regex produced, not just how many lines contain hits.
 */
function countMatches(lines: readonly OutputModalLine[]): number {
  let total = 0;
  for (const line of lines) {
    for (const segment of line.segments) {
      if (segment.isMatch) total += 1;
    }
  }
  return total;
}

/**
 * Build the right-hand status text shown next to the search input.
 *
 * Empty query → row count only. Invalid regex → "invalid regex".
 * Otherwise → "<matches> in <rows>". We deliberately avoid pluralising
 * to keep the status compact in narrow modals.
 */
function statusText(
  query: OutputModalQuery,
  rowCount: number,
  matchCount: number,
): string {
  if (query.invalid) return "invalid regex";
  if (query.regex === null) return `${rowCount} lines`;
  return `${matchCount} matches in ${rowCount} lines`;
}

/** Modal title — composed from the segment kind and source title. */
function titleFor(payload: OutputModalPayload): string {
  const prefix = payload.kind === "tool-result" ? "tool-result" : "thinking";
  return `${prefix}: ${payload.title}`;
}

/** Type-guard for the modal's `data` channel. */
function isPayload(value: unknown): value is OutputModalPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.kind === "tool-result" || candidate.kind === "thinking") &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string"
  );
}
