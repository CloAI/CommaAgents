import { Box, Text } from "ink";
import type React from "react";

import { useDebugRender } from "../../../hooks/useDebugRender";
import {
  TOOL_SPINNER_FRAMES,
  useToolSpinner,
} from "../../../hooks/useToolSpinner";
import type { ToolCallViewTheme } from "./ToolCallView.theme";
import { useToolCallViewTheme } from "./ToolCallView.theme";
import type { ToolCallViewStatus } from "./ToolCallView.types";
import {
  formatArgsPreview,
  formatResultSummary,
  staticGlyphForStatus,
} from "./ToolCallView.utils";

export interface ToolCallViewProps {
  /** Bare name of the tool that was invoked (e.g. `"read_file"`). */
  readonly toolName: string;
  /**
   * Stringified tool-call arguments. Multi-line / long blobs are
   * collapsed and clipped to a single visual row by the renderer; pass
   * the raw value here.
   */
  readonly args: string;
  /** Current visual state. */
  readonly status: ToolCallViewStatus;
  /**
   * Stringified tool-result output. Used only for `status === "completed"`
   * to derive the trailing `\u2192 N lines` summary.
   */
  readonly output?: string;
  /**
   * Error message, populated when the tool errored. Drives the
   * trailing `\u2192 <message>` summary for `status === "error"`.
   */
  readonly error?: string;
}

/**
 * One-line collapsed view of a tool call paired with its result.
 *
 * Renders as a single logical row inside an agent message:
 *
 * ```
 * <glyph> <toolName> <argsPreview>  <resultSummary>
 * ```
 *
 * - `<glyph>` animates between {@link TOOL_SPINNER_FRAMES} while the
 *   call is in flight (driven by the shared
 *   {@link useToolSpinner} interval) and resolves to a check / cross
 *   on completion.
 * - `<argsPreview>` is collapsed to one visual line and truncated; see
 *   {@link formatArgsPreview}.
 * - `<resultSummary>` is omitted while running and reduced to a line
 *   count or a clipped error message otherwise; see
 *   {@link formatResultSummary}.
 *
 * The component is intentionally render-pure beyond the spinner tick:
 * it does not subscribe to chat state and reads only the tokens it
 * needs from the theme.
 */
export function ToolCallView({
  toolName,
  args,
  status,
  output,
  error,
}: ToolCallViewProps): React.ReactElement {
  useDebugRender("ToolCallView", {
    props: { toolName, args, status, output, error },
  });
  const theme = useToolCallViewTheme();
  const spinnerFrame = useToolSpinner(status === "running");

  const leadingGlyph =
    status === "running"
      ? (spinnerFrame ?? TOOL_SPINNER_FRAMES[0])
      : staticGlyphForStatus(status);

  const argsPreview = formatArgsPreview(args);
  const resultSummary = formatResultSummary(status, output, error);

  return (
    <ToolCallViewRender
      theme={theme}
      leadingGlyph={leadingGlyph}
      toolName={toolName}
      argsPreview={argsPreview}
      resultSummary={resultSummary}
      status={status}
    />
  );
}

export interface ToolCallViewRenderProps {
  /** Resolved theme styles. */
  readonly theme: ToolCallViewTheme;
  /** Glyph rendered at the head of the row. */
  readonly leadingGlyph: string;
  /** Bare name of the tool. */
  readonly toolName: string;
  /** Pre-truncated, single-line args preview (may be empty). */
  readonly argsPreview: string;
  /** Pre-formatted result summary. Empty string when there is no result yet. */
  readonly resultSummary: string;
  /** Visual status — drives glyph color and error-summary styling. */
  readonly status: ToolCallViewStatus;
}

/**
 * Pure render half of {@link ToolCallView}.
 *
 * Split out so unit tests can render the component with a hand-crafted
 * theme and pre-formatted strings without touching the spinner hook or
 * the theme provider — same pattern as {@link CodeViewRender}.
 */
export function ToolCallViewRender({
  theme,
  leadingGlyph,
  toolName,
  argsPreview,
  resultSummary,
  status,
}: ToolCallViewRenderProps): React.ReactElement {
  const glyphStyle =
    status === "running"
      ? theme.runningGlyph
      : status === "completed"
        ? theme.completedGlyph
        : theme.errorGlyph;

  const summaryStyle =
    status === "error" ? theme.errorSummary : theme.resultSummary;

  return (
    <Box {...theme.container}>
      <Text>
        <Text {...glyphStyle}>{leadingGlyph}</Text>
        <Text> </Text>
        <Text {...theme.toolName}>{toolName}</Text>
        {argsPreview.length > 0 ? (
          <>
            <Text> </Text>
            <Text {...theme.args}>{argsPreview}</Text>
          </>
        ) : null}
        {resultSummary.length > 0 ? (
          <>
            <Text> </Text>
            <Text {...summaryStyle}>{resultSummary}</Text>
          </>
        ) : null}
      </Text>
    </Box>
  );
}
