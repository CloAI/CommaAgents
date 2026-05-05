import React from "react";
import { render } from "ink-testing-library";
import { describe, expect, it } from "bun:test";

import { StatusBar } from "./StatusBar";
import type { ChatStatus } from "../../hooks/useChat/useChat.types";

describe("StatusBar", () => {
  describe("status labels", () => {
    it("should display Ready label for idle status", () => {
      const { lastFrame } = render(
        <StatusBar status="idle" error={null} />,
      );

      expect(lastFrame()).toContain("[Ready]");
    });

    it("should display Starting label for pending status", () => {
      const { lastFrame } = render(
        <StatusBar status="pending" error={null} />,
      );

      expect(lastFrame()).toContain("[Starting...]");
    });

    it("should display Running label for running status", () => {
      const { lastFrame } = render(
        <StatusBar status="running" error={null} />,
      );

      expect(lastFrame()).toContain("[Running]");
    });

    it("should display Waiting for input label for waiting_input status", () => {
      const { lastFrame } = render(
        <StatusBar status="waiting_input" error={null} />,
      );

      expect(lastFrame()).toContain("[Waiting for input]");
    });

    it("should display Done label for completed status", () => {
      const { lastFrame } = render(
        <StatusBar status="completed" error={null} />,
      );

      expect(lastFrame()).toContain("[Done]");
    });

    it("should display Cancelled label for cancelled status", () => {
      const { lastFrame } = render(
        <StatusBar status="cancelled" error={null} />,
      );

      expect(lastFrame()).toContain("[Cancelled]");
    });

    it("should display Error label for error status", () => {
      const { lastFrame } = render(
        <StatusBar status="error" error={null} />,
      );

      expect(lastFrame()).toContain("[Error]");
    });
  });

  describe("snapshots", () => {
    it.each<ChatStatus>([
      "idle",
      "pending",
      "running",
      "waiting_input",
      "completed",
      "cancelled",
      "error",
    ])("should match snapshot for %s status", (status) => {
      const { lastFrame } = render(
        <StatusBar status={status} error={null} />,
      );

      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe("strategy name", () => {
    it("should display the strategy name when provided", () => {
      const { lastFrame } = render(
        <StatusBar status="running" error={null} strategyName="ReAct" />,
      );

      expect(lastFrame()).toContain("ReAct");
      expect(lastFrame()).toMatchSnapshot();
    });

    it("should not render strategy name when omitted", () => {
      const { lastFrame } = render(
        <StatusBar status="idle" error={null} />,
      );

      expect(lastFrame()).not.toContain("ReAct");
    });
  });

  describe("error display", () => {
    it("should display error text when provided", () => {
      const { lastFrame } = render(
        <StatusBar status="error" error="Connection lost" />,
      );

      expect(lastFrame()).toContain("Connection lost");
      expect(lastFrame()).toMatchSnapshot();
    });

    it("should display both strategy name and error together", () => {
      const { lastFrame } = render(
        <StatusBar status="error" error="Timeout" strategyName="CoT" />,
      );

      expect(lastFrame()).toContain("CoT");
      expect(lastFrame()).toContain("Timeout");
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
