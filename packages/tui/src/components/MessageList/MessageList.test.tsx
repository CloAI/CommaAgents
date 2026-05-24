import { describe, expect, it } from "bun:test";
import { Box } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { ModalContextProvider } from "../../hooks/useModal";
import { MessageList } from "./MessageList";
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
