import { describe, expect, test } from "bun:test";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";

import type { ChatMessage } from "../../hooks/useChat/useChat.types";
import { ModalContextProvider } from "../../hooks/useModal";
import { AgentMessage } from "./AgentMessage";
import { estimateMessageRowHeight } from "./MessageList.utils";
import { UserMessage } from "./UserMessage";

const BASE_TIMESTAMP = 0;

/**
 * Sentinel string rendered after each measured message. Forces the
 * message's `marginBottom` to materialize as a real row of vertical
 * space (Ink only emits the bottom margin when there's a following
 * sibling), and gives us an unambiguous boundary so we can count the
 * rows that "belong" to the message.
 */
const SENTINEL = "__SENTINEL__";

/**
 * Wait for Ink's measurement-driven re-renders to settle. Mirrors the
 * pattern in `MessageList.test.tsx`.
 */
async function flushFrames(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Strip ANSI codes, split into lines, drop trailing blank lines (Ink
 * pads to the box height), and return the row index where SENTINEL
 * appears. Everything before it is the message's full visual height
 * including its bottom margin.
 */
function measureMessageRows(frame: string): number {
  const stripped = frame.replace(/\u001b\[[0-9;]*m/g, "");
  const lines = stripped.split("\n");
  const sentinelIndex = lines.findIndex((line) => line.includes(SENTINEL));
  if (sentinelIndex === -1) {
    throw new Error(
      `Sentinel "${SENTINEL}" not found in rendered frame:\n${stripped}`,
    );
  }
  return sentinelIndex;
}

/**
 * Render a single role-dispatched message in a Box of width `viewportWidth`
 * followed by SENTINEL, and return the actual number of rows the message
 * (including bottom margin) consumes.
 *
 * Mirrors the layout that `ScrollableView` produces for `MessageList`:
 * each item renders inside a `Box flexDirection="column" width="100%"`
 * with no padding. `MessageList`'s outer `paddingX` lives outside the
 * `ScrollableView` viewport, so `viewportWidth` here matches what the
 * estimator receives at runtime.
 */
async function measure(
  message: ChatMessage,
  viewportWidth: number,
): Promise<number> {
  const messageElement = renderRole(message);
  const result = render(
    <ModalContextProvider>
      <Box width={viewportWidth} flexDirection="column">
        <Box flexDirection="column" width="100%">
          {messageElement}
        </Box>
        <Text>{SENTINEL}</Text>
      </Box>
    </ModalContextProvider>,
  );
  await flushFrames();
  const rows = measureMessageRows(result.lastFrame() ?? "");
  result.unmount();
  return rows;
}

/** Dispatch to the same role-specific renderer as `MessageList`. */
function renderRole(message: ChatMessage): React.ReactNode {
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
      />
    );
  }
  // System messages currently render as null in MessageList.tsx.
  return null;
}

function userMessage(text: string): ChatMessage {
  return {
    id: "u",
    role: "user",
    sender: "you",
    text,
    streaming: false,
    timestamp: BASE_TIMESTAMP,
  };
}

function agentMessage(
  textOrSegments: string | ChatMessage["segments"],
): ChatMessage {
  if (typeof textOrSegments === "string") {
    return {
      id: "a",
      role: "agent",
      sender: "planner",
      text: textOrSegments,
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
  }
  return {
    id: "a",
    role: "agent",
    sender: "planner",
    text: "ignored",
    segments: textOrSegments,
    streaming: false,
    timestamp: BASE_TIMESTAMP,
  };
}

/**
 * Width to use for tests that don't care about wrapping. Wide enough that
 * `word-wrap` never inserts soft-breaks for any of the test inputs.
 */
const WIDE = 80;

interface Case {
  readonly name: string;
  readonly message: ChatMessage;
  readonly viewportWidth: number;
}

const CASES: readonly Case[] = [
  // ===== User messages =====
  {
    name: "user: short single-line",
    message: userMessage("hello world"),
    viewportWidth: WIDE,
  },
  {
    name: "user: hard newlines (3 lines)",
    message: userMessage("first\nsecond\nthird"),
    viewportWidth: WIDE,
  },
  {
    name: "user: empty text",
    message: userMessage(""),
    viewportWidth: WIDE,
  },
  {
    name: "user: trailing newline",
    message: userMessage("hello\n"),
    viewportWidth: WIDE,
  },
  {
    name: "user: internal blank line",
    message: userMessage("a\n\nb"),
    viewportWidth: WIDE,
  },
  {
    name: "user: long line wraps at narrow width",
    // 24 chars; at width=26 the panel chrome is 4 ⇒ wrap width = 22 ⇒ 2 lines.
    message: userMessage("aaaa bbbb cccc dddd eeee"),
    viewportWidth: 26,
  },
  // ===== Agent messages with implicit single text segment =====
  {
    name: "agent: fallback text single-line",
    message: agentMessage("hello"),
    viewportWidth: WIDE,
  },
  {
    name: "agent: fallback text multi-line",
    message: agentMessage("line 1\nline 2"),
    viewportWidth: WIDE,
  },
  // ===== Agent: each segment kind in isolation =====
  {
    name: "agent: single text segment",
    message: agentMessage([{ type: "text", text: "intro", streaming: false }]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: single tool-call",
    message: agentMessage([
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "read_file",
        args: '{"path":"x"}',
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: single tool-result short",
    message: agentMessage([
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "read_file",
        output: "ok",
        status: "completed",
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: single tool-result multi-line",
    message: agentMessage([
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "read_file",
        output: "out-line-1\nout-line-2",
        status: "completed",
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: single thinking",
    message: agentMessage([
      {
        type: "thinking",
        id: "t1",
        text: "step one\nstep two",
        streaming: false,
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: single mcp-call no output",
    message: agentMessage([
      { type: "mcp-call", serverName: "s", toolName: "t", args: '{"k":"v"}' },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: single mcp-call with output",
    message: agentMessage([
      {
        type: "mcp-call",
        serverName: "s",
        toolName: "t",
        args: "{}",
        output: "a\nb\nc",
      },
    ]),
    viewportWidth: WIDE,
  },
  // ===== Agent: multi-segment combinations =====
  {
    name: "agent: text + tool-call + tool-result",
    message: agentMessage([
      { type: "text", text: "intro", streaming: false },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "read_file",
        args: '{"path":"x"}',
      },
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "read_file",
        output: "out-line-1\nout-line-2",
        status: "completed",
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: text + text (no marginTop on text)",
    message: agentMessage([
      { type: "text", text: "one", streaming: false },
      { type: "text", text: "two", streaming: false },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: tool-call + text",
    message: agentMessage([
      { type: "tool-call", toolCallId: "call_1", toolName: "r", args: "{}" },
      { type: "text", text: "after", streaming: false },
    ]),
    viewportWidth: WIDE,
  },
  // ===== Agent: tool-call pairing variants (Phase 1) =====
  {
    name: "agent: paired tool-call + tool-result (one collapsed row)",
    message: agentMessage([
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "read_file",
        args: '{"path":"x"}',
      },
      {
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "read_file",
        output: "line-a\nline-b\nline-c",
        status: "completed",
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: running tool-call (no paired result yet)",
    message: agentMessage([
      {
        type: "tool-call",
        toolCallId: "call_running",
        toolName: "read_file",
        args: '{"path":"y"}',
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: errored tool-call + tool-result with message",
    message: agentMessage([
      {
        type: "tool-call",
        toolCallId: "call_err",
        toolName: "write_file",
        args: '{"path":"z"}',
      },
      {
        type: "tool-result",
        toolCallId: "call_err",
        toolName: "write_file",
        output: "",
        status: "error",
        error: "ENOENT: no such file or directory",
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: orphan tool-result (no matching tool-call)",
    message: agentMessage([
      {
        type: "tool-result",
        toolCallId: "call_orphan",
        toolName: "read_file",
        output: "stranded\noutput",
        status: "completed",
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: paired tool-call wraps to multiple rows at narrow width",
    // Long tool name + args make the collapsed row exceed wrap width.
    message: agentMessage([
      {
        type: "tool-call",
        toolCallId: "call_wide",
        toolName: "fetch_remote_resource_with_long_name",
        args: '{"url":"https://example.com/a/b/c/d/e/f"}',
      },
      {
        type: "tool-result",
        toolCallId: "call_wide",
        toolName: "fetch_remote_resource_with_long_name",
        output: "x\ny\nz",
        status: "completed",
      },
    ]),
    viewportWidth: 30,
  },
  // ===== Agent: wrapping in segments =====
  {
    name: "agent: text segment wraps",
    message: agentMessage([
      { type: "text", text: "aaaa bbbb cccc dddd eeee", streaming: false },
    ]),
    viewportWidth: 26,
  },
  {
    name: "agent: thinking body wraps",
    message: agentMessage([
      {
        type: "thinking",
        id: "t1",
        text: "aaaa bbbb cccc dddd eeee",
        streaming: false,
      },
    ]),
    viewportWidth: 26,
  },
  // ===== Agent: markdown content (Phase 2) =====
  {
    name: "agent: markdown heading in text segment",
    message: agentMessage([
      { type: "text", text: "## Heading\nbody", streaming: false },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: markdown unordered list in text segment",
    message: agentMessage([
      {
        type: "text",
        text: "- one\n- two\n- three",
        streaming: false,
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: markdown ordered list in text segment",
    message: agentMessage([
      {
        type: "text",
        text: "1. alpha\n2. beta\n3. gamma",
        streaming: false,
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: markdown blockquote in text segment",
    message: agentMessage([
      {
        type: "text",
        text: "> quoted line\n> second quoted line",
        streaming: false,
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: markdown horizontal rule in text segment",
    message: agentMessage([
      { type: "text", text: "before\n\n---\n\nafter", streaming: false },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: markdown heading + list combined",
    message: agentMessage([
      {
        type: "text",
        text: "# Title\n\n- item one\n- item two",
        streaming: false,
      },
    ]),
    viewportWidth: WIDE,
  },
  {
    name: "agent: markdown thinking body (heading + list, truncated)",
    message: agentMessage([
      {
        type: "thinking",
        id: "tmd",
        text: "## reasoning\n- step a\n- step b",
        streaming: false,
      },
    ]),
    viewportWidth: WIDE,
  },
];

describe("estimateMessageRowHeight (render-anchored)", () => {
  for (const testCase of CASES) {
    test(testCase.name, async () => {
      const actualRows = await measure(
        testCase.message,
        testCase.viewportWidth,
      );
      const estimated = estimateMessageRowHeight(
        testCase.message,
        testCase.viewportWidth,
      );
      expect({
        case: testCase.name,
        estimated,
        actualRows,
      }).toEqual({
        case: testCase.name,
        estimated: actualRows,
        actualRows,
      });
    });
  }

  test("system message contributes 0 rows (renderer returns null)", () => {
    // System messages are not rendered (see MessageList.tsx); the estimator
    // must return 0 so they don't take up scroll geometry.
    const message: ChatMessage = {
      id: "s",
      role: "system",
      sender: "system",
      text: "anything",
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    expect(estimateMessageRowHeight(message, WIDE)).toBe(0);
  });

  test("falls back gracefully when viewportWidth is 0 (pre-layout)", () => {
    // `ScrollableView` reports `viewportWidth = 0` on the first render,
    // before measurement. The estimator must still return a positive
    // integer so `totalRows` can be computed without NaN/infinity.
    const message = userMessage("hello");
    const rows = estimateMessageRowHeight(message, 0);
    expect(Number.isFinite(rows)).toBe(true);
    expect(rows).toBeGreaterThan(0);
  });
});
