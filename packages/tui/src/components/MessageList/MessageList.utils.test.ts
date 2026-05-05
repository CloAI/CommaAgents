import { describe, expect, test } from "bun:test";

import type { ChatMessage } from "../../hooks/useChat/useChat.types";
import { estimateMessageRowHeight } from "./MessageList.utils";

const BASE_TIMESTAMP = 0;

describe("estimateMessageRowHeight", () => {
  test("user message: 2 frame rows + line count + 1 spacer", () => {
    const message: ChatMessage = {
      id: "u1",
      role: "user",
      sender: "you",
      text: "hello world",
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel) + 1 (one line of text) + 1 (bottom spacer) = 4
    expect(estimateMessageRowHeight(message)).toBe(4);
  });

  test("user message: counts hard newlines", () => {
    const message: ChatMessage = {
      id: "u2",
      role: "user",
      sender: "you",
      text: "first\nsecond\nthird",
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel) + 3 (lines) + 1 (spacer) = 6
    expect(estimateMessageRowHeight(message)).toBe(6);
  });

  test("agent message without segments uses fallbackText height", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "agent",
      sender: "planner",
      text: "line 1\nline 2",
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel) + 2 (text lines, no inter-segment spacer) + 1 (bottom spacer) = 5
    expect(estimateMessageRowHeight(message)).toBe(5);
  });

  test("agent message: each non-first segment adds a top spacer", () => {
    const message: ChatMessage = {
      id: "a2",
      role: "agent",
      sender: "planner",
      text: "ignored",
      segments: [
        { type: "text", text: "intro", streaming: false },
        { type: "tool-call", toolName: "read_file", args: '{"path":"x"}' },
        {
          type: "tool-result",
          toolName: "read_file",
          output: "out-line-1\nout-line-2",
        },
      ],
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel)
    //   + 1 (text "intro")
    //   + 1 spacer + 2 (tool-call header + args)
    //   + 1 spacer + 3 (tool-result header + 2 output lines)
    //   + 1 (bottom spacer)
    // = 11
    expect(estimateMessageRowHeight(message)).toBe(11);
  });

  test("agent message: thinking segment includes header row", () => {
    const message: ChatMessage = {
      id: "a3",
      role: "agent",
      sender: "planner",
      text: "ignored",
      segments: [
        {
          type: "thinking",
          id: "t1",
          text: "step one\nstep two",
          streaming: false,
        },
      ],
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel) + 1 (thinking header) + 2 (body lines) + 1 (spacer) = 6
    expect(estimateMessageRowHeight(message)).toBe(6);
  });

  test("agent message: mcp-call without output", () => {
    const message: ChatMessage = {
      id: "a4",
      role: "agent",
      sender: "planner",
      text: "ignored",
      segments: [
        {
          type: "mcp-call",
          serverName: "my-server",
          toolName: "do_thing",
          args: '{"k":"v"}',
        },
      ],
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel) + 1 (header) + 1 (args) + 1 (spacer) = 5
    expect(estimateMessageRowHeight(message)).toBe(5);
  });

  test("agent message: mcp-call with multi-line output", () => {
    const message: ChatMessage = {
      id: "a5",
      role: "agent",
      sender: "planner",
      text: "ignored",
      segments: [
        {
          type: "mcp-call",
          serverName: "my-server",
          toolName: "do_thing",
          args: "{}",
          output: "a\nb\nc",
        },
      ],
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel) + 1 (header) + 1 (args) + 3 (output) + 1 (spacer) = 8
    expect(estimateMessageRowHeight(message)).toBe(8);
  });

  test("system message: single row", () => {
    const message: ChatMessage = {
      id: "s1",
      role: "system",
      sender: "system",
      text: "anything",
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    expect(estimateMessageRowHeight(message)).toBe(1);
  });

  test("empty text still counts as one line", () => {
    const message: ChatMessage = {
      id: "u3",
      role: "user",
      sender: "you",
      text: "",
      streaming: false,
      timestamp: BASE_TIMESTAMP,
    };
    // 2 (panel) + 1 (empty line) + 1 (spacer) = 4
    expect(estimateMessageRowHeight(message)).toBe(4);
  });
});
