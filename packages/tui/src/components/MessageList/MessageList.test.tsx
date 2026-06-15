import { describe, expect, it } from "bun:test";
import { Box } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { ModalContextProvider } from "../../hooks/useModal";
import {
  findSubStrategyName,
  groupSubStrategyMessages,
  MessageList,
  selectSubStrategyMessages,
} from "./MessageList";
import { createChatMessage } from "./test.utils";

/**
 * Wait for Ink's viewport-measurement-driven re-renders to settle.
 *
 * Row heights are measured synchronously via the patched `measureLayout`,
 * but the viewport itself still goes through `useBoxMetrics`, which reports
 * zero on the first commit and updates from a post-commit effect.
 */
async function flushFrames(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Wrap in a sized box so `ScrollableView` has a real viewport in tests. */
function renderSized(element: React.ReactElement): ReturnType<typeof render> {
  return render(
    <ModalContextProvider>
      <Box height={20} width={80} flexDirection="column">
        {element}
      </Box>
    </ModalContextProvider>,
  );
}

describe("MessageList", () => {
  describe("empty state", () => {
    it("should display empty message when there are no messages", async () => {
      const result = renderSized(<MessageList messages={[]} />);
      await flushFrames();
      expect(result.lastFrame()).toContain("No messages yet.");
      expect(result.lastFrame()).toMatchSnapshot();
    });
  });

  describe("message rendering", () => {
    it("should display sender name and text for a single message", async () => {
      const messages = [
        createChatMessage({ id: "1", sender: "you", text: "Hi there" }),
      ];

      const result = renderSized(<MessageList messages={messages} />);
      await flushFrames();

      expect(result.lastFrame()).toContain("you");
      expect(result.lastFrame()).toContain("Hi there");
      expect(result.lastFrame()).toMatchSnapshot();
    });

    it("should display messages from all roles", async () => {
      const messages = [
        createChatMessage({
          id: "1",
          role: "user",
          sender: "you",
          text: "Hello",
        }),
        createChatMessage({
          id: "2",
          role: "agent",
          sender: "assistant",
          text: "Hi! How can I help?",
        }),
        createChatMessage({
          id: "3",
          role: "system",
          sender: "system",
          text: "Session started",
        }),
      ];

      const result = renderSized(<MessageList messages={messages} />);
      await flushFrames();

      // The list auto-pins to the bottom; the latest visible message is the
      // assistant reply (system role intentionally renders nothing).
      expect(result.lastFrame()).toContain("Hi! How can I help?");
      expect(result.lastFrame()).toMatchSnapshot();
    });

    it("should display agent model, context usage, and elapsed time", async () => {
      const messages = [
        createChatMessage({
          id: "1",
          role: "agent",
          sender: "planner",
          text: "Done",
          model: "openai/gpt-5",
          contextWindow: 128_000,
          usage: { promptTokens: 32_000, completionTokens: 1_000 },
          contextTokens: 33_000,
          timestamp: 1_000,
          completedAt: 6_000,
        }),
      ];

      const result = renderSized(<MessageList messages={messages} />);
      await flushFrames();

      expect(result.lastFrame()).toContain(
        "planner · openai/gpt-5 · ▰▰▱▱▱▱ 33k/128k · 5s",
      );
    });

    it("should group spawned strategy messages under the launch_strategy call", () => {
      const messages = [
        createChatMessage({
          id: "1",
          role: "agent",
          sender: "manager",
          text: "",
          segments: [
            {
              type: "tool-call",
              toolCallId: "launch-1",
              toolName: "launch_strategy",
              args: JSON.stringify({
                name: "Plan",
                input: "Draft a plan",
                modelOverride: "openai/gpt-5",
              }),
            },
          ],
        }),
        createChatMessage({
          id: "2",
          role: "agent",
          sender: "planner",
          text: "Nested plan output",
          segments: [
            { type: "text", text: "Nested plan output", streaming: false },
          ],
          parentToolCallId: "launch-1",
        }),
      ];

      const groupedMessages = groupSubStrategyMessages(messages);

      expect(groupedMessages).toHaveLength(1);
      expect(groupedMessages[0]?.subMessages).toHaveLength(1);
      expect(groupedMessages[0]?.subMessages[0]?.sender).toBe("planner");
    });

    it("should select only a spawned strategy transcript and its descendants", () => {
      const messages = [
        createChatMessage({
          id: "parent",
          role: "agent",
          sender: "manager",
          segments: [
            {
              type: "tool-call",
              toolCallId: "launch-plan",
              toolName: "launch_strategy",
              args: JSON.stringify({ name: "Plan", input: "Draft a plan" }),
            },
            {
              type: "tool-call",
              toolCallId: "launch-sibling",
              toolName: "launch_strategy",
              args: JSON.stringify({ name: "Sibling", input: "" }),
            },
          ],
        }),
        createChatMessage({
          id: "plan",
          role: "agent",
          sender: "planner",
          parentToolCallId: "launch-plan",
          segments: [
            {
              type: "tool-call",
              toolCallId: "launch-review",
              toolName: "launch_strategy",
              args: JSON.stringify({ name: "Review", input: "Review it" }),
            },
          ],
        }),
        createChatMessage({
          id: "review",
          role: "agent",
          sender: "reviewer",
          parentToolCallId: "launch-review",
        }),
        createChatMessage({
          id: "sibling",
          role: "agent",
          sender: "sibling",
          parentToolCallId: "launch-sibling",
        }),
      ];

      expect(
        selectSubStrategyMessages(messages, "launch-plan").map(
          (message) => message.id,
        ),
      ).toEqual(["plan", "review"]);
      expect(findSubStrategyName(messages, "launch-plan")).toBe("Plan");
      expect(findSubStrategyName(messages, "missing")).toBe("strategy");
    });

    it("should render spawned strategy output as a nested panel", async () => {
      const messages = [
        createChatMessage({
          id: "1",
          role: "agent",
          sender: "manager",
          text: "",
          segments: [
            {
              type: "tool-call",
              toolCallId: "launch-1",
              toolName: "launch_strategy",
              args: JSON.stringify({
                name: "Plan",
                input: "Draft a plan",
                modelOverride: "openai/gpt-5",
              }),
            },
            {
              type: "tool-result",
              toolCallId: "launch-1",
              toolName: "launch_strategy",
              output: JSON.stringify({
                ok: true,
                data: {
                  strategyName: "Plan",
                  path: "/strategies/plan.yaml",
                  result: "Plan complete",
                  finishReason: "stop",
                },
              }),
              status: "completed",
            },
          ],
        }),
        createChatMessage({
          id: "2",
          role: "agent",
          sender: "planner",
          text: "Nested plan output",
          segments: [
            { type: "text", text: "Nested plan output", streaming: false },
          ],
          parentToolCallId: "launch-1",
        }),
      ];

      const result = renderSized(
        <MessageList messages={messages} onOpenSubStrategy={() => {}} />,
      );
      await flushFrames();

      expect(result.lastFrame()).toContain("spawned Plan");
      expect(result.lastFrame()).toContain("launch_strategy");
      expect(result.lastFrame()).toContain("open");
      expect(result.lastFrame()).toContain("input: Draft a plan");
      expect(result.lastFrame()).toContain("model: openai/gpt-5");
      expect(result.lastFrame()).toContain("path: /strategies/plan.yaml");
      expect(result.lastFrame()).toContain("finish: stop");
      expect(result.lastFrame()).toContain("result: Plan complete");
      expect(result.lastFrame()).toContain("Nested plan output");
      expect(result.lastFrame()).toMatchSnapshot();
    });
  });

  describe("streaming indicator", () => {
    it("should show streaming cursor for messages that are still streaming", async () => {
      const messages = [
        createChatMessage({
          id: "1",
          role: "agent",
          sender: "assistant",
          text: "Thinking",
          streaming: true,
        }),
      ];

      const result = renderSized(<MessageList messages={messages} />);
      await flushFrames();

      expect(result.lastFrame()).toContain("\u258D");
      expect(result.lastFrame()).toMatchSnapshot();
    });

    it("should not show streaming cursor for completed messages", async () => {
      const messages = [
        createChatMessage({
          id: "1",
          role: "agent",
          sender: "assistant",
          text: "Done",
          streaming: false,
        }),
      ];

      const result = renderSized(<MessageList messages={messages} />);
      await flushFrames();

      expect(result.lastFrame()).not.toContain("\u258D");
    });
  });
});
