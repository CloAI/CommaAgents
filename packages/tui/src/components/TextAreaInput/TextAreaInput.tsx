import { type DOMElement, Box, Text, useBoxMetrics, useFocus, useInput } from "ink";
import chalk from "chalk";
import React, { useRef, useState } from "react";

import { isMouseEscape } from "../../hooks/useMouse";
import { useMouseWheelScroll } from "../../hooks/useMouseWheelScroll";
import { useTextAreaInputTheme } from "./TextAreaInput.theme";

export interface TextAreaInputProps {
	/** Current text value (controlled). */
	readonly value: string;
	/** Called when the text value changes. */
	readonly onChange: (value: string) => void;
	/** Width — columns (number) or CSS-like string (e.g. "100%"). */
	readonly width?: number | string;
	/** Visible row count. */
	readonly height?: number;
	/** Placeholder shown when value is empty. */
	readonly placeholder?: string;
	/**
	 * Stable focus ID for programmatic focusing via `useFocusManager().focus(id)`.
	 * When omitted the component still participates in tab-order cycling.
	 */
	readonly id?: string;
	/** Called on Meta+Enter with the current value. */
	readonly onSubmit?: (value: string) => void;
}

/**
 * Wrap text into display lines of at most `cols` characters.
 * Returns lines and parallel offsets (absolute index into `text`).
 */
function wrap(text: string, cols: number): { lines: string[]; offsets: number[] } {
	if (text.length === 0) return { lines: [""], offsets: [0] };
	const lines: string[] = [];
	const offsets: number[] = [];
	let abs = 0;
	for (const hard of text.split("\n")) {
		if (hard.length === 0) {
			lines.push("");
			offsets.push(abs);
		} else {
			for (let i = 0; i < hard.length; i += cols) {
				lines.push(hard.slice(i, i + cols));
				offsets.push(abs + i);
			}
		}
		abs += hard.length + 1;
	}
	return { lines, offsets };
}

/** Find display line and column for an absolute cursor offset. */
function locateCursor(cur: number, offsets: number[], lines: string[]): { line: number; col: number } {
	for (let i = offsets.length - 1; i >= 0; i--) {
		if (cur >= offsets[i]!) return { line: i, col: Math.min(cur - offsets[i]!, lines[i]!.length) };
	}
	return { line: 0, col: 0 };
}

/**
 * Multi-line text area input with shaded background and scrollbar.
 * Controlled component — parent owns `value`/`onChange`.
 */
export function TextAreaInput({
	value,
	onChange,
	width = "100%",
	height = 10,
	placeholder = "Type here...",
	id,
	onSubmit,
}: TextAreaInputProps) {
	const theme = useTextAreaInputTheme();
	const boxRef = useRef<DOMElement>(null) as React.RefObject<DOMElement>;
	const { width: measuredWidth } = useBoxMetrics(boxRef);

	const { isFocused } = useFocus({ id });

	const text = value.replace(/\r/g, "");
	const [cursor, setCursor] = useState(text.length);
	const [scroll, setScroll] = useState(0);

	const cols = measuredWidth > 0 ? measuredWidth : (typeof width === "number" ? width : 80);
	const cur = Math.min(cursor, text.length);
	const { lines, offsets } = wrap(text, cols);
	const total = lines.length;
	const scrollbar = total > height;
	const { line: curLine, col: curCol } = locateCursor(cur, offsets, lines);

	// Keep cursor in view.
	let vis = Math.max(0, Math.min(scroll, total - height));
	if (curLine < vis) vis = curLine;
	else if (curLine >= vis + height) vis = curLine - height + 1;
	if (vis !== scroll) Promise.resolve().then(() => setScroll(vis));

	// Scrollbar geometry.
	const thumbH = Math.max(1, Math.round((height / total) * height));
	const thumbY = total > height
		? Math.round((vis / (total - height)) * (height - thumbH))
		: 0;

	useMouseWheelScroll({
		ref: boxRef,
		onScroll: (event) => {
			if (event.direction === "up") {
				setScroll((s) => Math.max(0, s - 3));
			} else {
				setScroll((s) => Math.min(Math.max(0, total - height), s + 3));
			}
		},
	});

	useInput(
		(input, key) => {
			// Swallow any mouse escape sequences (clicks, drags, scroll ticks,
		// release events) so they are not typed into the buffer.
		if (isMouseEscape(input)) return;
			if (key.return && key.meta) {
				const t = text.trim();
				if (t && onSubmit) onSubmit(t);
				return;
			}
			if (key.return) {
				onChange(text.slice(0, cur) + "\n" + text.slice(cur));
				setCursor(cur + 1);
				return;
			}
			if (key.upArrow || key.downArrow) {
				const t = curLine + (key.upArrow ? -1 : 1);
				if (t < 0 || t >= total) return;
				setCursor(offsets[t]! + Math.min(curCol, lines[t]!.length));
				return;
			}
			if (key.leftArrow) { if (cur > 0) setCursor(cur - 1); return; }
			if (key.rightArrow) { if (cur < text.length) setCursor(cur + 1); return; }
			if (key.backspace || key.delete) {
				if (cur > 0) { onChange(text.slice(0, cur - 1) + text.slice(cur)); setCursor(cur - 1); }
				return;
			}
			if (input && !key.ctrl && !key.meta) {
				onChange(text.slice(0, cur) + input + text.slice(cur));
				setCursor(cur + input.length);
			}
		},
		{ isActive: isFocused },
	);

	// Render.
	const rows: React.ReactNode[] = [];
	for (let r = 0; r < height; r++) {
		const idx = vis + r;
		let row: string;
		let len: number;

		if (text.length === 0 && r === 0) {
			// Placeholder.
			const p = placeholder.slice(0, cols);
			row = isFocused ? chalk.inverse(p[0]!) + chalk.gray(p.slice(1)) : chalk.gray(p);
			len = p.length;
		} else if (isFocused && idx === curLine) {
			// Line with cursor.
			const ln = idx < total ? lines[idx]! : "";
			const before = ln.slice(0, curCol);
			const ch = curCol < ln.length ? ln[curCol]! : " ";
			const after = curCol < ln.length ? ln.slice(curCol + 1) : "";
			row = before + chalk.inverse(ch) + after;
			len = Math.max(ln.length, curCol + 1);
		} else {
			const ln = idx < total ? lines[idx]! : "";
			row = ln;
			len = ln.length;
		}

		// Pad + scrollbar (overwrite last col if needed).
		if (scrollbar) {
			const isThumb = r >= thumbY && r < thumbY + thumbH;
			const sCh = chalk.hex(isThumb ? theme.scrollThumbColor : theme.scrollTrackColor)(
				isThumb ? theme.scrollThumbChar : theme.scrollTrackChar,
			);
			const pad = Math.max(0, cols - 1 - len);
			row = row + " ".repeat(pad) + sCh;
		} else if (len < cols) {
			row += " ".repeat(cols - len);
		}

		rows.push(<Text key={r} wrap="truncate">{row}</Text>);
	}

	return (
		<Box ref={boxRef} width={width} height={height} flexDirection="column" backgroundColor={theme.backgroundColor}>
			{rows}
		</Box>
	);
}
