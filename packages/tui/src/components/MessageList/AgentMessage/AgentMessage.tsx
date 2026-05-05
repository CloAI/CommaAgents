import { Box, Text } from "ink";
import type React from "react";

import type { MessageSegment } from "../../../hooks/useChat/useChat.types";
import { BorderedPanel } from "../../BorderedPanel";
import { useMessageListTheme } from "../MessageList.theme";

/**
 * Streaming-cursor glyph appended to in-flight text/thinking segments.
 *
 * Half-block character — chosen for its visibility in dark and light
 * terminals while staying narrow enough to read as a cursor rather than a
 * box.
 */
const STREAMING_CURSOR_CHAR = "\u258D";

/** Truncate long tool-call argument blobs so they fit a single visual line. */
const MAX_TOOL_ARGS_PREVIEW_LENGTH = 200;

/**
 * Trailing pad appended to streaming text so an in-flight frame can't leave
 * ghost characters behind from the previous (longer) frame.
 *
 * Ink's incremental renderer only redraws cells that change. When a streaming
 * text block shrinks between ticks (rare, but happens when e.g. the model
 * rewrites a partial token), the leftover characters from the previous frame
 * stay on screen until something else overwrites them. Appending a newline
 * forces Ink to clear the rest of the visual line and the next row, so
 * shrinking content can't bleed through.
 */
const STREAMING_TRAILING_PAD = "\n";

export interface AgentMessageProps {
  /** Display name of the agent (e.g. "planner", "builder"). */
  readonly sender: string;
  /**
   * Ordered body segments. When omitted, `fallbackText` is rendered as a
   * single text segment so the component still works for legacy/simple
   * messages that don't yet emit segmented events.
   */
  readonly segments?: readonly MessageSegment[];
  /** Plain text body used when `segments` is empty or undefined. */
  readonly fallbackText: string;
  /** Whether the message is still receiving streaming events. */
  readonly streaming: boolean;
}

/**
 * Renders a single agent message with rich, ordered body segments.
 *
 * Each segment kind (text, tool-call, tool-result, thinking, mcp-call)
 * gets its own visual treatment so that the user can distinguish the
 * agent's prose from its tool invocations and reasoning at a glance.
 */
export function AgentMessage({
  sender,
  segments,
  fallbackText,
  streaming,
}: AgentMessageProps): React.ReactElement {
  const theme = useMessageListTheme();

  const resolvedSegments: readonly MessageSegment[] =
    segments && segments.length > 0
      ? segments
      : [{ type: "text", text: fallbackText, streaming }];

  return (
    <AgentMessageRender
      theme={theme}
      sender={sender}
      segments={resolvedSegments}
      streaming={streaming}
    />
  );
}

export interface AgentMessageRenderProps {
  /** Resolved MessageList theme styles. */
  readonly theme: ReturnType<typeof useMessageListTheme>;
  /** Display name of the agent. */
  readonly sender: string;
  /** Ordered body segments. */
  readonly segments: readonly MessageSegment[];
  /** Whether the message is still receiving streaming events. */
  readonly streaming: boolean;
}

export function AgentMessageRender({
  theme,
  sender,
  segments,
  streaming,
}: AgentMessageRenderProps): React.ReactElement {
  const styles = theme.agentMessage;
  return (
    <Box {...styles.container}>
      <BorderedPanel
        header={sender}
        borderColor={styles.borderColor}
        headerColor={styles.label.color}
      >
        {segments.map((segment, segmentIndex) => (
          <SegmentView
            // Position-based key is acceptable because segments are
            // append-only — we never reorder or remove them.
            key={`${segmentIndex}-${segment.type}`}
            segment={segment}
            theme={theme}
          />
        ))}
        {streaming && segments.length === 0 ? (
          <Text {...styles.streamingCursor}>{STREAMING_CURSOR_CHAR}</Text>
        ) : null}
      </BorderedPanel>
    </Box>
  );
}

interface SegmentViewProps {
  readonly segment: MessageSegment;
  readonly theme: ReturnType<typeof useMessageListTheme>;
}

function SegmentView({ segment, theme }: SegmentViewProps): React.ReactElement | null {
  const styles = theme.agentMessage;

  if (segment.type === "text") {
    return (
      <Text {...styles.textSegment}>
        {segment.text}
        {segment.streaming ? (
          <>
            <Text {...styles.streamingCursor}>{STREAMING_CURSOR_CHAR}</Text>
            {STREAMING_TRAILING_PAD}
          </>
        ) : null}
      </Text>
    );
  }

  if (segment.type === "tool-call") {
    const argsPreview = truncatePreview(segment.args);
    return (
      <Box {...styles.toolCall.container}>
        <Text>
          <Text {...styles.toolCall.header}>{"\u2192 tool "}</Text>
          <Text {...styles.toolCall.label}>{segment.toolName}</Text>
        </Text>
        <Text {...styles.toolCall.args}>{argsPreview}</Text>
      </Box>
    );
  }

  if (segment.type === "tool-result") {
    return (
      <Box {...styles.toolResult.container}>
        <Text {...styles.toolResult.header}>{`\u2190 ${segment.toolName} result`}</Text>
        <Text {...styles.toolResult.output}>{segment.output}</Text>
      </Box>
    );
  }

  if (segment.type === "thinking") {
    return (
      <Box {...styles.thinking.container}>
        <Text {...styles.thinking.header}>thinking</Text>
        <Text {...styles.thinking.text}>
          {segment.text}
          {segment.streaming ? (
            <>
              <Text {...styles.streamingCursor}>{STREAMING_CURSOR_CHAR}</Text>
              {STREAMING_TRAILING_PAD}
            </>
          ) : null}
        </Text>
      </Box>
    );
  }

  if (segment.type === "mcp-call") {
    const argsPreview = truncatePreview(segment.args);
    return (
      <Box {...styles.mcpCall.container}>
        <Text>
          <Text {...styles.mcpCall.header}>{`\u2192 mcp ${segment.serverName} `}</Text>
          <Text>{segment.toolName}</Text>
        </Text>
        <Text {...styles.mcpCall.args}>{argsPreview}</Text>
        {segment.output !== undefined ? (
          <Text {...styles.mcpCall.output}>{segment.output}</Text>
        ) : null}
      </Box>
    );
  }

  // Exhaustiveness guard — TypeScript's discriminated union catches new
  // segment kinds at compile time, but we still render nothing rather
  // than crashing if a new variant slips through at runtime.
  return null;
}

/** Trim long argument blobs to a single-line preview suffixed with ellipsis. */
function truncatePreview(value: string): string {
  if (value.length <= MAX_TOOL_ARGS_PREVIEW_LENGTH) return value;
  return `${value.slice(0, MAX_TOOL_ARGS_PREVIEW_LENGTH)}\u2026`;
}
