/**
 * Cursor + scroll math for {@link TextAreaInput}.
 *
 * The single source of truth for the cursor is `cursorIndex` — an offset
 * into the *normalized* (CRLF → LF) raw `value`. The wrapped display grid
 * is a derived view; we map between the two with {@link buildIndexCellMap}.
 *
 * Movement intents (`left`, `right`, `up`, `down`) operate on the wrapped
 * grid for natural visual navigation, then translate back to a raw index.
 * `snapToCursor` keeps the index put and just (re)derives the cell + scroll
 * offset — used after an edit changes `value` and/or `cursorIndex`.
 */

export type CursorIntent =
  | { readonly kind: "left" }
  | { readonly kind: "right" }
  | { readonly kind: "up" }
  | { readonly kind: "down" }
  | { readonly kind: "snapToCursor" };

export interface CursorCell {
  readonly x: number;
  readonly y: number;
}

export interface CursorState {
  readonly cursorIndex: number;
  readonly cell: CursorCell;
  readonly rowDisplayOffset: number;
}

export interface ComputeNextCursorStateParams {
  readonly intent: CursorIntent;
  /** Normalized raw text (LF only). */
  readonly value: string;
  /** Wrapped display rows derived from `value`. */
  readonly rows: readonly string[];
  /** Cursor offset into `value` before this update. */
  readonly currentCursorIndex: number;
  /** Scroll offset before this update. */
  readonly currentRowDisplayOffset: number;
  /** Visible row count of the textarea. */
  readonly viewportHeight: number;
  /**
   * Width measurement function. Inject `stringWidth` at the call site;
   * tests can pass `(text) => text.length` for ASCII fixtures.
   */
  readonly measureWidth: (text: string) => number;
}

/**
 * Pure transition function for the textarea cursor index, derived cell, and
 * scroll offset. Fully clamped to `value` / `rows` / viewport so callers can
 * apply all three pieces of state on the same render tick.
 */
export function computeNextCursorState(
  params: ComputeNextCursorStateParams,
): CursorState {
  const {
    intent,
    value,
    rows,
    currentCursorIndex,
    currentRowDisplayOffset,
    viewportHeight,
    measureWidth,
  } = params;

  const indexCellMap = buildIndexCellMap(value, rows, measureWidth);
  const clampedCurrentIndex = clampIndex(currentCursorIndex, value);
  const currentCell = cellForIndex(clampedCurrentIndex, indexCellMap);

  const targetCell = computeTargetCell(intent, rows, currentCell, measureWidth);
  const clampedCell = clampCellToRows(targetCell, rows, measureWidth);

  const nextCursorIndex =
    intent.kind === "snapToCursor"
      ? clampedCurrentIndex
      : indexForCell(clampedCell, indexCellMap, value.length);

  // Re-derive the cell from the chosen index so cell + index stay coherent
  // even when the wrap mapping isn't perfectly bijective.
  const finalCell = cellForIndex(nextCursorIndex, indexCellMap);

  const nextRowDisplayOffset = computeRowDisplayOffset({
    cellY: finalCell.y,
    currentRowDisplayOffset,
    viewportHeight,
    totalRows: rows.length,
  });

  return {
    cursorIndex: nextCursorIndex,
    cell: finalCell,
    rowDisplayOffset: nextRowDisplayOffset,
  };
}

/**
 * Map every raw-string index (0..value.length inclusive) to a cell on the
 * wrapped grid.
 *
 * Strategy: walk `value` and the concatenation of `rows` in lockstep. When
 * the next raw char matches the next wrapped char, advance both. When the
 * wrapped grid moves to a new row that doesn't correspond to a `\n` in
 * `value` (a soft wrap), absorb the row break without consuming a raw char.
 * When `word-wrap` drops a space at a soft-wrap boundary, consume the raw
 * space without advancing the cell. The trailing entry maps `value.length`
 * to the cell *after* the last character.
 */
export function buildIndexCellMap(
  value: string,
  rows: readonly string[],
  measureWidth: (text: string) => number,
): readonly CursorCell[] {
  const indexToCell: CursorCell[] = [];
  let rowIndex = 0;
  let columnIndex = 0;

  for (let rawIndex = 0; rawIndex < value.length; rawIndex++) {
    const rawChar = value[rawIndex] ?? "";

    if (rawChar === "\n") {
      indexToCell.push({ x: columnIndex, y: rowIndex });
      rowIndex = Math.min(rowIndex + 1, Math.max(0, rows.length - 1));
      columnIndex = 0;
      continue;
    }

    const currentRow = rows[rowIndex] ?? "";
    const wrappedChar = currentRow[columnIndex];

    if (wrappedChar === rawChar) {
      indexToCell.push({ x: columnIndex, y: rowIndex });
      columnIndex += measureWidth(rawChar);
      continue;
    }

    // Wrapped row exhausted — soft wrap to next row.
    if (columnIndex >= currentRow.length && rowIndex < rows.length - 1) {
      rowIndex += 1;
      columnIndex = 0;
      const nextRow = rows[rowIndex] ?? "";
      if (nextRow[0] === rawChar) {
        indexToCell.push({ x: 0, y: rowIndex });
        columnIndex += measureWidth(rawChar);
        continue;
      }
      // Char was dropped by the wrapper (e.g. trailing space). Pin to the
      // end of the previous row so backspace lands somewhere sensible.
      const previousRow = rows[rowIndex - 1] ?? "";
      indexToCell.push({
        x: measureWidth(previousRow),
        y: rowIndex - 1,
      });
      continue;
    }

    // Mismatch without a row break — wrapper diverged. Pin to current cell.
    indexToCell.push({ x: columnIndex, y: rowIndex });
  }

  // Trailing entry for cursor at end-of-buffer.
  if (rows.length === 0) {
    indexToCell.push({ x: 0, y: 0 });
  } else {
    const lastRowIndex = rows.length - 1;
    const lastRowWidth = measureWidth(rows[lastRowIndex] ?? "");
    if (rowIndex === lastRowIndex) {
      indexToCell.push({ x: columnIndex, y: rowIndex });
    } else {
      indexToCell.push({ x: lastRowWidth, y: lastRowIndex });
    }
  }

  return indexToCell;
}

function clampIndex(index: number, value: string): number {
  return Math.max(0, Math.min(index, value.length));
}

function cellForIndex(
  index: number,
  indexCellMap: readonly CursorCell[],
): CursorCell {
  if (indexCellMap.length === 0) return { x: 0, y: 0 };
  const clampedIndex = Math.max(
    0,
    Math.min(index, indexCellMap.length - 1),
  );
  return indexCellMap[clampedIndex] ?? { x: 0, y: 0 };
}

/**
 * Inverse lookup: pick the raw index whose mapped cell best matches `cell`.
 * Prefers an exact match; falls back to the largest index on the same row
 * with x ≤ cell.x; final fallback is `value.length`.
 */
function indexForCell(
  cell: CursorCell,
  indexCellMap: readonly CursorCell[],
  valueLength: number,
): number {
  let bestIndex = -1;
  let bestX = -1;

  for (let rawIndex = 0; rawIndex < indexCellMap.length; rawIndex++) {
    const candidate = indexCellMap[rawIndex];
    if (!candidate || candidate.y !== cell.y) continue;
    if (candidate.x === cell.x) return rawIndex;
    if (candidate.x < cell.x && candidate.x > bestX) {
      bestIndex = rawIndex;
      bestX = candidate.x;
    }
  }

  if (bestIndex >= 0) return bestIndex;
  return valueLength;
}

/** Compute the unclamped target cell for a movement intent. */
function computeTargetCell(
  intent: CursorIntent,
  rows: readonly string[],
  currentCell: CursorCell,
  measureWidth: (text: string) => number,
): CursorCell {
  const { x: currentX, y: currentY } = currentCell;

  switch (intent.kind) {
    case "left": {
      if (currentX > 0) return { x: currentX - 1, y: currentY };
      if (currentY > 0) {
        const previousRowWidth = measureWidth(rows[currentY - 1] ?? "");
        return { x: previousRowWidth, y: currentY - 1 };
      }
      return currentCell;
    }
    case "right": {
      const currentRowWidth = measureWidth(rows[currentY] ?? "");
      if (currentX < currentRowWidth) return { x: currentX + 1, y: currentY };
      if (currentY < rows.length - 1) return { x: 0, y: currentY + 1 };
      return currentCell;
    }
    case "up": {
      if (currentY > 0) return { x: currentX, y: currentY - 1 };
      return currentCell;
    }
    case "down": {
      if (currentY < rows.length - 1) return { x: currentX, y: currentY + 1 };
      return currentCell;
    }
    case "snapToCursor": {
      return currentCell;
    }
  }
}

/** Clamp a cell so it lands on a real grid position within `rows`. */
function clampCellToRows(
  cell: CursorCell,
  rows: readonly string[],
  measureWidth: (text: string) => number,
): CursorCell {
  if (rows.length === 0) return { x: 0, y: 0 };
  const clampedY = Math.max(0, Math.min(cell.y, rows.length - 1));
  const rowWidth = measureWidth(rows[clampedY] ?? "");
  const clampedX = Math.max(0, Math.min(cell.x, rowWidth));
  return { x: clampedX, y: clampedY };
}

/**
 * Pick the smallest scroll offset that keeps `cellY` inside the viewport,
 * preferring the current offset when the cursor is already visible.
 */
function computeRowDisplayOffset(params: {
  readonly cellY: number;
  readonly currentRowDisplayOffset: number;
  readonly viewportHeight: number;
  readonly totalRows: number;
}): number {
  const { cellY, currentRowDisplayOffset, viewportHeight, totalRows } = params;

  if (viewportHeight <= 0) return 0;

  const maxOffset = Math.max(0, totalRows - viewportHeight);
  let nextOffset = currentRowDisplayOffset;

  if (cellY < nextOffset) {
    nextOffset = cellY;
  } else if (cellY >= nextOffset + viewportHeight) {
    nextOffset = cellY - viewportHeight + 1;
  }

  return Math.max(0, Math.min(maxOffset, nextOffset));
}
