import { useMemo } from "react";

import { useTheme } from "../../theme";

/** Spread-ready style objects for the TextAreaInput component. */
export interface TextAreaInputTheme {
	/** Background color for the text area. */
	readonly backgroundColor: string;
	/** Scrollbar thumb color (bright). */
	readonly scrollThumbColor: string;
	/** Scrollbar track color (dim). */
	readonly scrollTrackColor: string;
	/** Character used for the scrollbar thumb. */
	readonly scrollThumbChar: string;
	/** Character used for the scrollbar track. */
	readonly scrollTrackChar: string;
	/** Placeholder text color. */
	readonly placeholderColor: string;
	/** Cursor highlight background color. */
	readonly cursorColor: string;
}

/**
 * Returns themed style objects for the TextAreaInput component.
 * Consumes global tokens via `useTheme()`.
 */
export function useTextAreaInputTheme(): TextAreaInputTheme {
	const tokens = useTheme();

	return useMemo<TextAreaInputTheme>(
		() => ({
			backgroundColor: tokens.colors.surface,
			scrollThumbColor: tokens.colors.scrollThumb,
			scrollTrackColor: tokens.colors.scrollTrack,
			scrollThumbChar: "\u2588",
			scrollTrackChar: "\u2502",
			placeholderColor: tokens.colors.muted,
			cursorColor: tokens.colors.cursor,
		}),
		[tokens],
	);
}
