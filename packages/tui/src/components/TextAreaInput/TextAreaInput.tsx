import chalk from "chalk";
import {
  Box,
  type DOMElement,
  Text,
  useBoxMetrics,
  useFocus,
  useInput,
} from "ink";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import stringWidth from "string-width";
import wrap from "word-wrap";
import { isMouseEscape } from "../../utils/mouseEscape";
import { Scrollbar } from "../Scrollbar";
import { useTextAreaInputTheme } from "./TextAreaInput.theme";
import {
  type CursorCell,
  type CursorIntent,
  computeNextCursorState,
} from "./TextAreaInput.utils";

export interface TextAreaInputProps {
  /** Current text value (controlled). */
  readonly value: string;
  /** Called when the text value changes. */
  readonly onChange: (value: string) => void;
  /** Width — columns (number) or CSS-like string (e.g. "100%"). */
  readonly width?: number | string;
  /** Fixed visible row count. When set, disables auto-expanding. */
  readonly height?: number;
  /** Minimum visible rows when auto-expanding (default: 3). */
  readonly minHeight?: number;
  /** Maximum visible rows when auto-expanding (default: 5). */
  readonly maxHeight?: number;
  /** Placeholder shown when value is empty. */
  readonly placeholder?: string;
  /**
   * Stable focus ID for programmatic focusing via `useFocusManager().focus(id)`.
   * When omitted the component still participates in tab-order cycling.
   */
  readonly id?: string;
  /** Called on Enter with the current value. Ctrl/Shift/Meta+Enter inserts a newline. */
  readonly onSubmit?: (value: string) => void;
}

/**
 * Multi-line text area input with an inline rendered cursor (a gray
 * background on the character at `cursorIndex`). Controlled — parent owns
 * `value`/`onChange`.
 *
 * The cursor's source of truth is `cursorIndex` (an offset into the
 * normalized raw value). The wrapped display cell + scroll offset are
 * derived from it each render via {@link computeNextCursorState}.
 *
 * Keybindings:
 * - Enter                 → calls `onSubmit(value.trim())` if provided
 * - Ctrl/Shift/Meta+Enter → inserts a newline at the cursor
 * - Arrow keys            → move cursor (preserves column on up/down)
 * - Backspace/Delete      → delete the character before the cursor
 */
export function TextAreaInput({
  value,
  onChange,
  width = "100%",
  height,
  minHeight = 3,
  maxHeight = 5,
  placeholder = "Type here...",
  id,
  onSubmit,
}: TextAreaInputProps) {
  const boxRef = useRef<DOMElement>(null) as React.RefObject<DOMElement>;
  const { width: measuredWidth } = useBoxMetrics(boxRef);
  const { isFocused } = useFocus({ id });

  /** Cursor offset into the normalized raw value — single source of truth. */
  const [cursorIndex, setCursorIndex] = useState(0);
  /** Index of the first visible wrapped row. */
  const [rowDisplayOffset, setRowDisplayOffset] = useState(0);

  const textAreaColumns =
    measuredWidth > 0 ? measuredWidth : typeof width === "number" ? width : 80;

  const normalizedValue = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Wrap each hard-break segment independently. `word-wrap` strips trailing
  // newlines from its input, so passing the whole value would lose blank
  // trailing rows (e.g. "hello\n" → ["hello"] instead of ["hello", ""]).
  const textLines = normalizedValue.split("\n").flatMap((segment) =>
    wrap(segment, {
      width: textAreaColumns,
      newline: "\n",
      indent: "",
    }).split("\n"),
  );

  const effectiveHeight = 5;

  // Re-derive cell + scroll offset from `cursorIndex` every render. Edits
  // and arrow keys both go through `computeNextCursorState`, so we never
  // store a cell that can drift away from the index.
  const derivedState = computeNextCursorState({
    intent: { kind: "snapToCursor" },
    value: normalizedValue,
    rows: textLines,
    currentCursorIndex: cursorIndex,
    currentRowDisplayOffset: rowDisplayOffset,
    viewportHeight: effectiveHeight,
    measureWidth: stringWidth,
  });

  // Pull the recomputed scroll offset back into state when the viewport
  // needs to follow an edit (value change or layout shift).
  useEffect(() => {
    if (derivedState.rowDisplayOffset !== rowDisplayOffset) {
      setRowDisplayOffset(derivedState.rowDisplayOffset);
    }
  }, [derivedState.rowDisplayOffset, rowDisplayOffset]);

  function applyMove(intent: CursorIntent): void {
    const nextState = computeNextCursorState({
      intent,
      value: normalizedValue,
      rows: textLines,
      currentCursorIndex: cursorIndex,
      currentRowDisplayOffset: rowDisplayOffset,
      viewportHeight: effectiveHeight,
      measureWidth: stringWidth,
    });
    setCursorIndex(nextState.cursorIndex);
    setRowDisplayOffset(nextState.rowDisplayOffset);
  }

  function insertAtCursor(text: string): void {
    const nextValue =
      normalizedValue.slice(0, cursorIndex) +
      text +
      normalizedValue.slice(cursorIndex);
    setCursorIndex(cursorIndex + text.length);
    onChange(nextValue);
  }

  function deleteBeforeCursor(): void {
    if (cursorIndex === 0) return;
    const nextValue =
      normalizedValue.slice(0, cursorIndex - 1) +
      normalizedValue.slice(cursorIndex);
    setCursorIndex(cursorIndex - 1);
    onChange(nextValue);
  }

  useInput(
    (input, key) => {
      if (isMouseEscape(input)) return;

      if (key.return && (key.ctrl || key.shift || key.meta)) {
        insertAtCursor("\n");
        return;
      }
      if (key.return) {
        if (onSubmit) onSubmit(value.trim());
        return;
      }

      if (key.leftArrow) return applyMove({ kind: "left" });
      if (key.rightArrow) return applyMove({ kind: "right" });
      if (key.upArrow) return applyMove({ kind: "up" });
      if (key.downArrow) return applyMove({ kind: "down" });

      if (key.backspace || key.delete) {
        deleteBeforeCursor();
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        insertAtCursor(input);
      }
    },
    { isActive: isFocused },
  );

  return (
    <TextAreaInputRender
      boxRef={boxRef}
      width={width}
      height={effectiveHeight}
      rows={textLines}
      rowDisplayOffset={derivedState.rowDisplayOffset}
      cursorCell={derivedState.cell}
      showCursor={isFocused}
      textAreaColumns={textAreaColumns}
      showScrollbar={textLines.length > effectiveHeight}
      showPlaceholder={value.length === 0}
      placeholder={placeholder}
    />
  );
}

export interface TextAreaInputRenderProps {
  /** Ref forwarded to the outer Box for layout metrics + mouse wheel. */
  readonly boxRef: React.RefObject<DOMElement>;
  /** Width passed through to the outer Box. */
  readonly width: number | string;
  /** Visible row count. */
  readonly height: number;
  /** Pre-wrapped display rows. */
  readonly rows: readonly string[];
  /** Index of the first visible row. */
  readonly rowDisplayOffset: number;
  /** Cell of the cursor on the wrapped grid (absolute, not viewport-relative). */
  readonly cursorCell: CursorCell;
  /** Whether to render the cursor highlight. */
  readonly showCursor: boolean;
  /** Content width in columns (excludes scrollbar column when shown). */
  readonly textAreaColumns: number;
  /** Whether to render the scrollbar column. */
  readonly showScrollbar: boolean;
  /** Whether to render placeholder text in place of `rows`. */
  readonly showPlaceholder: boolean;
  /** Placeholder string. */
  readonly placeholder: string;
}

/** Pure presentational form of {@link TextAreaInput}. */
export function TextAreaInputRender({
  boxRef,
  width,
  height,
  rows,
  rowDisplayOffset,
  cursorCell,
  showCursor,
  textAreaColumns,
  showScrollbar,
  showPlaceholder,
  placeholder,
}: TextAreaInputRenderProps): React.ReactElement {
  const theme = useTextAreaInputTheme();
  const visibleRows = rows.slice(rowDisplayOffset, rowDisplayOffset + height);

  return (
    <Box ref={boxRef} width={width} height={height} {...theme.textAreaInput}>
      <Box {...theme.textAreaInputContent} width={textAreaColumns}>
        {showPlaceholder ? (
          <Text {...theme.textAreaPlaceholder}>
            {placeholder.slice(0, textAreaColumns)}
          </Text>
        ) : (
          visibleRows.map((row, visibleRowIndex) => {
            const absoluteRowIndex = rowDisplayOffset + visibleRowIndex;
            const isCursorRow = showCursor && cursorCell.y === absoluteRowIndex;
            return (
              <Text key={`row-${absoluteRowIndex}`}>
                {isCursorRow
                  ? renderRowWithCursor(row, cursorCell.x)
                  : row.length === 0
                    ? " "
                    : row}
              </Text>
            );
          })
        )}
      </Box>
      {showScrollbar && (
        <Scrollbar
          total={rows.length}
          windowSize={height}
          offset={rowDisplayOffset}
          height={height}
        />
      )}
    </Box>
  );
}

/**
 * Render a row with a gray-background "cursor" cell at column `cursorX`.
 *
 * When the cursor sits past the last character of the row (or the row is
 * empty), pad with a trailing space so the highlight is still visible.
 * Uses `chalk.bgGray` so the highlight survives ink's text composition.
 */
function renderRowWithCursor(row: string, cursorX: number): string {
  const padded = row.length <= cursorX ? row.padEnd(cursorX + 1, " ") : row;
  const before = padded.slice(0, cursorX);
  const cursorChar = padded.slice(cursorX, cursorX + 1) || " ";
  const after = padded.slice(cursorX + 1);
  return before + chalk.bgGray(cursorChar) + after;
}
