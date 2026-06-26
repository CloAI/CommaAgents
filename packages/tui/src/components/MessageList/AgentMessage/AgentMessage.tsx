import { Box, type DOMElement, Text } from "ink";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import type {
  ChatMessage,
  MessageSegment,
} from "../../../hooks/useChat/useChat.types";
import { useModal } from "../../../hooks/useModal";
import { useMouseClick } from "../../../hooks/useMouseClick";
import { BorderedPanel } from "../../BorderedPanel";
import {
  CONTEXT_USAGE_MODAL_ID,
  type ContextUsageModalPayload,
} from "../ContextUsageModal";
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
  /** Provider/model identifier used for this call. */
  readonly model?: string;
  /** Maximum model context tokens, when known. */
  readonly contextWindow?: number;
  /** Final model-step context usage. */
  readonly contextUsage?: ChatMessage["contextUsage"];
  /** Call start timestamp in milliseconds. */
  readonly startedAt: number;
  /** Call completion timestamp in milliseconds. */
  readonly completedAt?: number;
  /** Messages emitted by `launch_strategy` calls inside this agent message. */
  readonly subMessages?: readonly GroupedChatMessage[];
  /** Opens a spawned strategy transcript in its dedicated page. */
  readonly onOpenSubStrategy?: (toolCallId: string) => void;
}

/**
 * Renders a single agent message with rich, ordered body segments.
 *
 * Each segment kind (text, tool-call, tool-result, thinking)
 * gets its own visual treatment so that the user can distinguish the
 * agent's prose from its tool invocations and reasoning at a glance.
 */
export function AgentMessage({
  sender,
  segments,
  fallbackText,
  streaming,
  model,
  contextWindow,
  contextUsage,
  startedAt,
  completedAt,
  subMessages = [],
  onOpenSubStrategy,
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
      model={model}
      contextWindow={contextWindow}
      contextUsage={contextUsage}
      startedAt={startedAt}
      completedAt={completedAt}
      subMessages={subMessages}
      onOpenSubStrategy={onOpenSubStrategy}
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
  readonly model?: string;
  readonly contextWindow?: number;
  readonly contextUsage?: ChatMessage["contextUsage"];
  readonly startedAt: number;
  readonly completedAt?: number;
  /** Messages emitted by `launch_strategy` calls inside this agent message. */
  readonly subMessages: readonly GroupedChatMessage[];
  /** Opens a spawned strategy transcript in its dedicated page. */
  readonly onOpenSubStrategy?: (toolCallId: string) => void;
}

export function AgentMessageRender({
  theme,
  sender,
  segments,
  streaming,
  model,
  contextWindow,
  contextUsage,
  startedAt,
  completedAt,
  subMessages,
  onOpenSubStrategy,
}: AgentMessageRenderProps): React.ReactElement {
  const styles = theme.agentMessage;
  const elapsed = useElapsed(startedAt, completedAt, streaming);
  const contextUsageRef = useRef<DOMElement | null>(null);
  const { open } = useModal(CONTEXT_USAGE_MODAL_ID);

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

  useMouseClick({
    ref: contextUsageRef,
    onClick: () => {
      if (contextUsage === undefined) return;
      const payload: ContextUsageModalPayload = {
        agentName: sender,
        contextUsage,
        ...(model !== undefined ? { model } : {}),
        ...(contextWindow !== undefined ? { contextWindow } : {}),
      };
      open(payload);
    },
  });

  return (
    <Box {...styles.container}>
      <BorderedPanel
        headerRef={contextUsageRef}
        header={
          <AgentMessageHeader
            sender={sender}
            model={model}
            contextWindow={contextWindow}
            contextUsage={contextUsage}
            elapsed={elapsed}
            theme={theme}
          />
        }
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
              onOpenSubStrategy={onOpenSubStrategy}
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
  readonly onOpenSubStrategy?: (toolCallId: string) => void;
}

function SegmentView({
  segment,
  theme,
  pairedResult,
  subMessages,
  onOpenSubStrategy,
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
        title: displayToolName(segment),
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

  if (segment.type === "retention") {
    const event = segment.event;
    return (
      <Box {...styles.thinking.container}>
        <Text {...styles.thinking.header}>retention</Text>
        <Box flexDirection="column">
          <Text>
            {formatRetentionSummary(
              event.recordsCompacted,
              event.recordsRetained,
              event.trigger.contextUsage?.totalTokens,
              event.trigger.tokenLimit,
            )}
          </Text>
          <MarkdownView markdown={event.summaryRecord.text} />
        </Box>
      </Box>
    );
  }

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
          onOpen={
            onOpenSubStrategy
              ? () => onOpenSubStrategy(segment.toolCallId)
              : undefined
          }
        >
          {subMessages.length > 0 ? (
            subMessages.map((message) => (
              <NestedMessageView
                key={message.id}
                message={message}
                onOpenSubStrategy={onOpenSubStrategy}
              />
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
          toolName={displayToolName(segment)}
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
        >{`\u2190 ${displayToolName(segment)} result`}</Text>
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

  // Exhaustiveness guard — TypeScript's discriminated union catches new
  // segment kinds at compile time, but we still render nothing rather
  // than crashing if a new variant slips through at runtime.
  return null;
}

function displayToolName(
  segment: Extract<
    MessageSegment,
    { readonly type: "tool-call" | "tool-result" }
  >,
): string {
  return segment.mcp
    ? `${segment.mcp.serverId} / ${segment.mcp.toolName}`
    : segment.toolName;
}

interface NestedMessageViewProps {
  readonly message: GroupedChatMessage;
  readonly onOpenSubStrategy?: (toolCallId: string) => void;
}

function NestedMessageView({
  message,
  onOpenSubStrategy,
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
        model={message.model}
        contextWindow={message.contextWindow}
        contextUsage={message.contextUsage}
        startedAt={message.timestamp}
        completedAt={message.completedAt}
        subMessages={message.subMessages}
        onOpenSubStrategy={onOpenSubStrategy}
      />
    );
  }

  return null;
}

interface AgentMessageHeaderProps {
  readonly sender: string;
  readonly model?: string;
  readonly contextWindow?: number;
  readonly contextUsage?: ChatMessage["contextUsage"];
  readonly elapsed?: string;
  readonly theme: ReturnType<typeof useMessageListTheme>;
}

function AgentMessageHeader({
  sender,
  model,
  contextWindow,
  contextUsage,
  elapsed,
  theme,
}: AgentMessageHeaderProps): React.ReactElement {
  const styles = theme.agentMessage;
  const totalTokens = contextUsage?.totalTokens;

  // Color the bar + count together by fraction of the window used. When the
  // window is unknown (model absent from the catalog) we still show the raw
  // token count so usage never silently disappears.
  const usageColor =
    contextWindow !== undefined && totalTokens !== undefined
      ? contextBarColor(
          totalTokens / contextWindow,
          styles.headerDetail.contextBar,
        )
      : styles.headerDetail.context.color;

  return (
    <Text>
      <Text {...styles.label}>{sender}</Text>
      {model ? (
        <>
          <Text {...styles.headerDetail.separator}> {"\u00B7"} </Text>
          <Text {...styles.headerDetail.model}>{truncateModel(model)}</Text>
        </>
      ) : null}
      {totalTokens !== undefined ? (
        <>
          <Text {...styles.headerDetail.separator}> {"\u00B7"} </Text>
          {contextWindow !== undefined ? (
            <Text color={usageColor} bold>
              {renderContextBar(totalTokens / contextWindow)}{" "}
            </Text>
          ) : null}
          <Text color={usageColor} bold>
            {formatContextCount(totalTokens, contextWindow)}
          </Text>
        </>
      ) : null}
      {elapsed ? (
        <>
          <Text {...styles.headerDetail.separator}> {"\u00B7"} </Text>
          <Text {...styles.headerDetail.time}>{elapsed}</Text>
        </>
      ) : null}
    </Text>
  );
}

function useElapsed(
  startedAt: number,
  completedAt: number | undefined,
  streaming: boolean,
): string | undefined {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [streaming]);

  return streaming || completedAt !== undefined
    ? formatElapsed((completedAt ?? now) - startedAt)
    : undefined;
}

/** Eighth-width block glyphs (1/8 through 7/8) for sub-cell bar fill. */
const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"] as const;

/** Render a fractional fill bar using full + partial block glyphs. */
function renderContextBar(fraction: number, units = 6): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const totalEighths = Math.round(clamped * units * 8);
  const fullCells = Math.min(units, Math.floor(totalEighths / 8));
  const remainder = totalEighths % 8;
  let bar = "█".repeat(fullCells);
  if (remainder > 0 && fullCells < units) bar += PARTIAL_BLOCKS[remainder];
  return bar.padEnd(units, " ");
}

/** Pick the bar color for how full the context window is. */
function contextBarColor(
  fraction: number,
  barColors: {
    readonly low: string;
    readonly medium: string;
    readonly high: string;
  },
): string {
  if (fraction >= 0.85) return barColors.high;
  if (fraction >= 0.6) return barColors.medium;
  return barColors.low;
}

/** Format the token count, including the window when it is known. */
function formatContextCount(
  totalTokens: number,
  contextWindow: number | undefined,
): string {
  return contextWindow !== undefined
    ? `${formatTokens(totalTokens)}/${formatTokens(contextWindow)}`
    : formatTokens(totalTokens);
}

/** Truncate an over-long model id so it can't push the bar off the header line. */
function truncateModel(model: string, max = 40): string {
  return model.length > max ? `${model.slice(0, max - 1)}…` : model;
}

function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined) return "?";
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${Math.round(tokens / 100_000) / 10}m`;
}

function formatRetentionSummary(
  recordsCompacted: number,
  recordsRetained: number,
  totalTokens: number | undefined,
  tokenLimit: number | undefined,
): string {
  const tokenSummary =
    totalTokens !== undefined && tokenLimit !== undefined
      ? ` at ${formatTokens(totalTokens)}/${formatTokens(tokenLimit)}`
      : "";
  return `Compacted ${recordsCompacted} records into summary${tokenSummary}; retained ${recordsRetained} recent records.`;
}

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
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
