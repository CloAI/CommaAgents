import { Box, type DOMElement, Text } from "ink";
import type React from "react";
import { useRef } from "react";

import type { MessageSegment } from "../../../hooks/useChat/useChat.types";
import { useModal } from "../../../hooks/useModal";
import { useMouseClick } from "../../../hooks/useMouseClick";
import { BorderedPanel } from "../../BorderedPanel";
import { MarkdownView, truncateThinking } from "../MarkdownView";
import { useMessageListTheme } from "../MessageList.theme";
import type { GroupedChatMessage } from "../MessageList.types";
import { OUTPUT_MODAL_ID, type OutputModalPayload } from "../OutputModal";
import { SpawnedStrategyView } from "../SpawnedStrategyView";
import { ToolCallView } from "../ToolCallView";
import { UserMessage } from "../UserMessage";

/**
 * Streaming-cursor glyph appended to in-flight text/thinking segments.
 *
 * Half-block character — chosen for its visibility in dark and light
 * terminals while staying narrow enough to read as a cursor rather than a
 * box.
 */
const STREAMING_CURSOR_CHAR = "\u258D";

/**
 * Truncate long tool-call argument blobs so they fit a single visual line.
 */
export const MAX_TOOL_ARGS_PREVIEW_LENGTH = 200;

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
  /** Messages emitted by `launch_strategy` calls inside this agent message. */
  readonly subMessages?: readonly GroupedChatMessage[];
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
  subMessages = [],
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
      subMessages={subMessages}
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
  /** Messages emitted by `launch_strategy` calls inside this agent message. */
  readonly subMessages: readonly GroupedChatMessage[];
}

export function AgentMessageRender({
  theme,
  sender,
  segments,
  streaming,
  subMessages,
}: AgentMessageRenderProps): React.ReactElement {
  const styles = theme.agentMessage;

  // Build a `toolCallId → tool-result` index so each tool-call row can
  // render with its paired result inline (single collapsed row),
  // regardless of whether the result arrived adjacent to the call or
  // was interleaved with text/thinking from concurrent tool runs. The
  // index is intentionally rebuilt per render — `segments` is
  // append-only and short (tens of entries at most), so an O(n) walk is
  // cheaper than the bookkeeping needed to memoize it.
  const resultsByCallId = new Map<
    string,
    Extract<MessageSegment, { readonly type: "tool-result" }>
  >();
  for (const segment of segments) {
    if (segment.type === "tool-result") {
      resultsByCallId.set(segment.toolCallId, segment);
    }
  }

  return (
    <Box {...styles.container}>
      <BorderedPanel
        header={sender}
        borderColor={styles.borderColor}
        headerColor={styles.label.color}
      >
        {segments.map((segment, segmentIndex) => {
          // Skip tool-result segments that have a matching tool-call —
          // they render as the trailing summary of that call's row.
          // Orphan tool-results (no preceding tool-call with the same
          // id) still render via `SegmentView` so we never silently drop
          // a daemon event.
          if (
            segment.type === "tool-result" &&
            segments.some(
              (other) =>
                other.type === "tool-call" &&
                other.toolCallId === segment.toolCallId,
            )
          ) {
            return null;
          }

          return (
            <SegmentView
              // Position-based key is acceptable because segments are
              // append-only — we never reorder or remove them.
              key={`${segmentIndex}-${segment.type}`}
              segment={segment}
              theme={theme}
              pairedResult={
                segment.type === "tool-call"
                  ? resultsByCallId.get(segment.toolCallId)
                  : undefined
              }
              subMessages={
                segment.type === "tool-call"
                  ? subMessages.filter(
                      (message) =>
                        message.parentToolCallId === segment.toolCallId,
                    )
                  : []
              }
            />
          );
        })}
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
  /**
   * Tool-result paired with this segment by `toolCallId`. Only set when
   * `segment.type === "tool-call"` and a matching `tool-result` has
   * arrived. Drives the trailing `\u2192 N lines` summary on the
   * call's row.
   */
  readonly pairedResult?: Extract<
    MessageSegment,
    { readonly type: "tool-result" }
  >;
  readonly subMessages: readonly GroupedChatMessage[];
}

function SegmentView({
  segment,
  theme,
  pairedResult,
  subMessages,
}: SegmentViewProps): React.ReactElement | null {
  const styles = theme.agentMessage;
  const { open } = useModal(OUTPUT_MODAL_ID);

  // Refs + click handlers for the two expandable segment kinds. The hooks
  // are declared unconditionally (rules of hooks); the refs only attach
  // to a real `<Box>` for the relevant branches below, and `useMouseClick`
  // simply never fires for un-attached refs because hit-testing fails.
  const toolCallRef = useRef<DOMElement | null>(null);
  const thinkingRef = useRef<DOMElement | null>(null);

  useMouseClick({
    ref: toolCallRef,
    onClick: () => {
      if (segment.type !== "tool-call") return;
      const payload: OutputModalPayload = {
        kind: "tool-result",
        title: segment.toolName,
        body: toolCallBody(pairedResult),
      };
      open(payload);
    },
  });

  useMouseClick({
    ref: thinkingRef,
    onClick: () => {
      if (segment.type !== "thinking") return;
      const payload: OutputModalPayload = {
        kind: "thinking",
        title: "thinking",
        body: segment.text,
      };
      open(payload);
    },
  });

  if (segment.type === "text") {
    // Markdown segments are re-lexed on every delta — `marked.lexer`
    // is fast enough to call from the render path, and it auto-closes
    // unfinished fences/lists so partial output never visually
    // corrupts. The streaming cursor is appended as a sibling
    // element rather than inlined into the markdown source so it
    // never participates in tokenisation.
    return (
      <Box flexDirection="column">
        <MarkdownView markdown={segment.text} />
        {segment.streaming ? (
          <Text {...styles.streamingCursor}>{STREAMING_CURSOR_CHAR}</Text>
        ) : null}
      </Box>
    );
  }

  if (segment.type === "tool-call") {
    if (segment.toolName === "launch_strategy") {
      return (
        <SpawnedStrategyView
          args={segment.args}
          status={pairedResult === undefined ? "running" : pairedResult.status}
          output={pairedResult?.output}
          error={pairedResult?.error}
        >
          {subMessages.length > 0 ? (
            subMessages.map((message) => (
              <NestedMessageView key={message.id} message={message} />
            ))
          ) : (
            <Text {...styles.streamingCursor}>Waiting for spawned output…</Text>
          )}
        </SpawnedStrategyView>
      );
    }

    return (
      <Box ref={toolCallRef} flexDirection="column">
        <ToolCallView
          toolName={segment.toolName}
          args={segment.args}
          status={pairedResult === undefined ? "running" : pairedResult.status}
          output={pairedResult?.output}
          error={pairedResult?.error}
        />
      </Box>
    );
  }

  if (segment.type === "tool-result") {
    // Orphan tool-result (no matching tool-call segment in this
    // message). Should be rare — emitted defensively so a malformed
    // stream still surfaces something rather than silently dropping
    // the result. Reuses the legacy two-row layout.
    const toolResultPreview = truncatePreview(segment.output);
    return (
      <Box {...styles.toolResult.container}>
        <Text
          {...styles.toolResult.header}
        >{`\u2190 ${segment.toolName} result`}</Text>
        <Text {...styles.toolResult.output}>{toolResultPreview}</Text>
      </Box>
    );
  }

  if (segment.type === "thinking") {
    // Truncate to the last N rendered lines so a long deliberation
    // can't dominate the viewport, then render the (truncated) text
    // via Markdown so embedded code fences / lists keep their shape.
    const truncated = truncateThinking(segment.text);
    return (
      <Box ref={thinkingRef} {...styles.thinking.container}>
        <Text {...styles.thinking.header}>thinking</Text>
        <Box flexDirection="column">
          <MarkdownView markdown={truncated} />
          {segment.streaming ? (
            <Text {...styles.streamingCursor}>{STREAMING_CURSOR_CHAR}</Text>
          ) : null}
        </Box>
      </Box>
    );
  }

  if (segment.type === "mcp-call") {
    const argsPreview = truncatePreview(segment.args);
    return (
      <Box {...styles.mcpCall.container}>
        <Text>
          <Text
            {...styles.mcpCall.header}
          >{`\u2192 mcp ${segment.serverName} `}</Text>
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

interface NestedMessageViewProps {
  readonly message: GroupedChatMessage;
}

function NestedMessageView({
  message,
}: NestedMessageViewProps): React.ReactElement | null {
  if (message.role === "user") {
    return <UserMessage text={message.text} label={message.sender} />;
  }

  if (message.role === "agent") {
    return (
      <AgentMessage
        sender={message.sender}
        segments={message.segments}
        fallbackText={message.text}
        streaming={message.streaming}
        subMessages={message.subMessages}
      />
    );
  }

  return null;
}

/**
 * Trim long argument blobs to a single-line preview suffixed with ellipsis.
 *
 * Exported so the row-height estimator can compute heights against the
 * exact same string the renderer will draw.
 */
export function truncatePreview(value: string): string {
  if (value.length <= MAX_TOOL_ARGS_PREVIEW_LENGTH) return value;
  return `${value.slice(0, MAX_TOOL_ARGS_PREVIEW_LENGTH)}\u2026`;
}

/**
 * Resolve the body shown when a user expands a tool-call row in the
 * OutputModal.
 *
 * Pre-result rows show a placeholder so the modal still has something
 * to grep over instead of opening blank. When the result has arrived,
 * we surface the error first (if any) since that's what the user is
 * almost always after, with the output as a trailing context block.
 * For successful results we fall through to the raw output verbatim.
 */
function toolCallBody(
  pairedResult:
    | Extract<MessageSegment, { readonly type: "tool-result" }>
    | undefined,
): string {
  if (pairedResult === undefined) return "(tool still running)";
  if (pairedResult.status === "error") {
    const error = pairedResult.error ?? "(no error message)";
    if (pairedResult.output.length === 0) return error;
    return `${error}\n\n--- output ---\n${pairedResult.output}`;
  }
  return pairedResult.output;
}
