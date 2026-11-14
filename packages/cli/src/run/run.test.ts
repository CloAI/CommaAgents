import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import type { DiscoveredStrategy } from "@comma-agents/core/strategy";
import { RunMessageStatus, type RunMessage } from "@comma-agents/daemon";
import { agentMessageText, resolveStrategy } from "./run.utils";

const discovered: DiscoveredStrategy[] = [
  {
    name: "Build",
    version: "3.0",
    path: "/strategies/build/build.json",
    manifestPath: "/strategies/comma-project.json",
    origin: "bundled",
    label: "@comma/core-strategies > Build",
  },
];

describe("resolveStrategy", () => {
  it("should match a discovered strategy by name case-insensitively", () => {
    expect(resolveStrategy("build", "/work", discovered)).toEqual({
      strategyPath: "/strategies/build/build.json",
      manifestPath: "/strategies/comma-project.json",
    });
  });

  it("should match a discovered strategy by label", () => {
    expect(
      resolveStrategy("@comma/core-strategies > Build", "/work", discovered),
    ).toEqual({
      strategyPath: "/strategies/build/build.json",
      manifestPath: "/strategies/comma-project.json",
    });
  });

  it("should accept an existing file path that discovery did not find", () => {
    const filePath = resolve(import.meta.dirname, "run.ts");
    expect(resolveStrategy(filePath, "/work", discovered)).toEqual({
      strategyPath: filePath,
    });
  });

  it("should list available strategies when nothing matches", () => {
    expect(() => resolveStrategy("missing", "/work", discovered)).toThrow(
      'Strategy "missing" not found. Available: @comma/core-strategies > Build',
    );
  });
});

describe("agentMessageText", () => {
  it("should join text blocks and skip other content", () => {
    const message: RunMessage = {
      type: "message",
      messageId: "m1",
      runId: "r1",
      createdAt: "2026-10-26T00:00:00.000Z",
      role: "agent",
      agentName: "builder",
      status: RunMessageStatus.completed,
      content: [
        { type: "text", text: "first" },
        { type: "reasoning", text: "hidden" },
        { type: "text", text: "second" },
      ],
    };
    expect(agentMessageText(message)).toBe("first\nsecond");
  });

  it("should ignore user messages", () => {
    const message: RunMessage = {
      type: "message",
      messageId: "m2",
      runId: "r1",
      createdAt: "2026-10-26T00:00:00.000Z",
      role: "user",
      status: RunMessageStatus.completed,
      content: [{ type: "text", text: "hello" }],
    };
    expect(agentMessageText(message)).toBeUndefined();
  });
});
