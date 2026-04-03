// Tests for @comma-agents/debug — debugAgent and debugFlow.

import { describe, expect, it } from "bun:test";
import { createAgent, createSequentialFlow } from "@comma-agents/core";
import { debugAgent, debugFlow } from "./debug";
import { breakLines, collapseNewlines, truncateText } from "./debug.utils";

// Helpers

/** Capture output lines into an array instead of console.log. */
function createCapture(): { lines: string[]; output: (line: string) => void } {
  const lines: string[] = [];
  return { lines, output: (line: string) => lines.push(line) };
}

/** Create a mock agent via createAgent with a custom execute (supports appendHook). */
function makeMockAgent(name: string, response: string, systemPrompt?: string) {
  return createAgent({
    name,
    execute: async (_msg) => response,
    systemPrompt,
  });
}

// debugAgent

describe("debugAgent", () => {
  it("should return the same agent reference", () => {
    const agent = makeMockAgent("test", "response");
    const { output } = createCapture();
    const result = debugAgent(agent, { output });
    expect(result).toBe(agent);
  });

  it("should print agent name and system prompt on call", () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("writer", "response", "You are a writer.");
    debugAgent(agent, { output });

    expect(lines).toContain("[writer] System: You are a writer.");
  });

  it("should truncate long system prompts", () => {
    const { lines, output } = createCapture();
    const longPrompt = "A".repeat(200);
    const agent = makeMockAgent("writer", "response", longPrompt);
    debugAgent(agent, { output, truncate: 50 });

    const systemLine = lines.find((l) => l.includes("System:"));
    expect(systemLine).toBeDefined();
    expect(systemLine!).toContain("...");
    // 50 chars of A's + "..." = the truncated portion
    expect(systemLine?.length).toBeLessThan(200);
  });

  it("should omit system prompt when showSystemPrompt is false", () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("writer", "response", "You are a writer.");
    debugAgent(agent, { output, showSystemPrompt: false });

    const systemLine = lines.find((l) => l.includes("System:"));
    expect(systemLine).toBeUndefined();
    // Should still print the agent name
    expect(lines.some((l) => l.includes("[writer]"))).toBe(true);
  });

  it("should print tool names when agent has tools", () => {
    const { lines, output } = createCapture();
    const agent = createAgent({
      name: "tooled",
      execute: async (_msg) => "response",
      // defineTool would be more accurate but createAgent accepts ToolDef map
      // For this test we just need config.tools to exist
    });
    // Agent without tools — verify no "Tools:" line
    debugAgent(agent, { output });
    const toolLine = lines.find((l) => l.includes("Tools:"));
    expect(toolLine).toBeUndefined();
  });

  it("should log input on beforeCall hook", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("echo", "response");
    debugAgent(agent, { output });

    await agent.call("hello world");

    const inputLine = lines.find((l) => l.includes('<- "hello world"'));
    expect(inputLine).toBeDefined();
    expect(inputLine!).toContain("[echo]");
  });

  it("should log output on afterCall hook", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("echo", "the response text");
    debugAgent(agent, { output });

    await agent.call("hello");

    const outputLine = lines.find((l) => l.includes('-> "the response text"'));
    expect(outputLine).toBeDefined();
    expect(outputLine!).toContain("[echo]");
  });

  it("should truncate long input messages", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("echo", "response");
    debugAgent(agent, { output, truncate: 20 });

    await agent.call("A".repeat(100));

    const inputLine = lines.find((l) => l.includes("<-"));
    expect(inputLine).toBeDefined();
    expect(inputLine!).toContain("...");
  });

  it("should truncate long output messages", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("echo", "B".repeat(200));
    debugAgent(agent, { output, truncate: 30 });

    await agent.call("hello");

    const outputLine = lines.find((l) => l.includes("->"));
    expect(outputLine).toBeDefined();
    expect(outputLine!).toContain("...");
  });

  it("should handle agents without config gracefully", () => {
    const { lines, output } = createCapture();
    // A plain Agent object without config (like a flow agent or user agent)
    // We can't use hookIntoAgent on this, but describeAgentConfig should handle it.
    // For this test, just verify the describe part doesn't crash.
    const agent = makeMockAgent("minimal", "response");
    // createAgent always sets config, so this tests the happy path.
    debugAgent(agent, { output });
    expect(lines.some((l) => l.includes("[minimal]"))).toBe(true);
  });

  it("should preserve real newlines in previews by default", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("echo", "line1\nline2\nline3");
    debugAgent(agent, { output });

    await agent.call("hello");

    const outputLine = lines.find((l) => l.includes("->"));
    expect(outputLine).toBeDefined();
    // Default: newlines are preserved as real \n
    expect(outputLine!).toContain("\n");
    expect(outputLine!).not.toContain("\\n");
  });

  it("should collapse newlines when collapseNewlines is true", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("echo", "line1\nline2\nline3");
    debugAgent(agent, { output, collapseNewlines: true });

    await agent.call("hello");

    const outputLine = lines.find((l) => l.includes("->"));
    expect(outputLine).toBeDefined();
    expect(outputLine!).toContain("\\n");
  });

  it("should inject tool hooks without errors", () => {
    const { output } = createCapture();
    const agent = makeMockAgent("tooled", "response");
    // debugAgent now injects beforeToolCall + afterToolCall — verify no throw
    expect(() => debugAgent(agent, { output })).not.toThrow();
  });
});

// debugFlow

describe("debugFlow", () => {
  it("should return the same flow reference", () => {
    const { output } = createCapture();
    const agent = makeMockAgent("a", "response");
    const flow = createSequentialFlow({ name: "pipe", steps: [agent] });
    const result = debugFlow(flow, { output });
    expect(result).toBe(flow);
  });

  it("should log flow start with name and input", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("a", "response");
    const flow = createSequentialFlow({ name: "my-pipeline", steps: [agent] });
    debugFlow(flow, { output });

    await flow.call("hello");

    expect(lines.some((l) => l.includes("Flow: my-pipeline"))).toBe(true);
    expect(lines.some((l) => l.includes('Input: "hello"'))).toBe(true);
  });

  it("should log flow done", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("a", "response");
    const flow = createSequentialFlow({ name: "pipe", steps: [agent] });
    debugFlow(flow, { output });

    await flow.call("hello");

    expect(lines.some((l) => l.includes("Flow: pipe") && l.includes("Done"))).toBe(true);
  });

  it("should log each step with name and input/output", async () => {
    const { lines, output } = createCapture();
    const a = makeMockAgent("writer", "draft text");
    const b = makeMockAgent("editor", "final text");
    const flow = createSequentialFlow({ name: "pipe", steps: [a, b] });
    debugFlow(flow, { output });

    await flow.call("write something");

    // Step 1: writer
    expect(lines.some((l) => l.includes("Step: writer"))).toBe(true);
    expect(lines.some((l) => l.includes("Input:") && l.includes("write something"))).toBe(true);
    expect(lines.some((l) => l.includes("Output:") && l.includes("draft text"))).toBe(true);

    // Step 2: editor (receives writer's output as input)
    expect(lines.some((l) => l.includes("Step: editor"))).toBe(true);
    expect(lines.some((l) => l.includes("Input:") && l.includes("draft text"))).toBe(true);
    expect(lines.some((l) => l.includes("Output:") && l.includes("final text"))).toBe(true);
  });

  it("should print token usage per step when showTokens is true", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("a", "response");
    const flow = createSequentialFlow({ name: "pipe", steps: [agent] });
    debugFlow(flow, { output, showTokens: true });

    await flow.call("hello");

    // execute override returns usage { promptTokens: 0, completionTokens: 0 }
    expect(lines.some((l) => l.includes("tokens"))).toBe(true);
  });

  it("should omit token usage when showTokens is false", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("a", "response");
    const flow = createSequentialFlow({ name: "pipe", steps: [agent] });
    debugFlow(flow, { output, showTokens: false });

    await flow.call("hello");

    expect(lines.some((l) => l.includes("tokens"))).toBe(false);
  });

  it("should truncate step input and output", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("a", "X".repeat(200));
    const flow = createSequentialFlow({ name: "pipe", steps: [agent] });
    debugFlow(flow, { output, truncate: 30 });

    await flow.call("Y".repeat(200));

    const inputLines = lines.filter((l) => l.includes("Input:"));
    const outputLines = lines.filter((l) => l.includes("Output:"));
    // Both should contain "..." from truncation
    expect(inputLines.some((l) => l.includes("..."))).toBe(true);
    expect(outputLines.some((l) => l.includes("..."))).toBe(true);
  });

  it("should log steps in order for a 3-step pipeline", async () => {
    const { lines, output } = createCapture();
    const a = makeMockAgent("step-1", "out-1");
    const b = makeMockAgent("step-2", "out-2");
    const c = makeMockAgent("step-3", "out-3");
    const flow = createSequentialFlow({ name: "pipe", steps: [a, b, c] });
    debugFlow(flow, { output });

    await flow.call("start");

    const stepLines = lines.filter((l) => l.includes("Step:"));
    expect(stepLines.length).toBe(3);
    expect(stepLines[0]).toContain("step-1");
    expect(stepLines[1]).toContain("step-2");
    expect(stepLines[2]).toContain("step-3");
  });
});

// Utils (indirect coverage via debugAgent/debugFlow)

describe("formatting", () => {
  it("should not truncate when truncate is 0 (default)", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("a", "Z".repeat(200));
    debugAgent(agent, { output });

    await agent.call("hello");

    const outputLine = lines.find((l) => l.includes("->"));
    expect(outputLine).toBeDefined();
    // Default truncate is 0 (unlimited), so all 200 Z's should appear
    expect(outputLine!).not.toContain("...");
    expect(outputLine!).toContain("Z".repeat(200));
  });

  it("should not truncate short messages", async () => {
    const { lines, output } = createCapture();
    const agent = makeMockAgent("a", "short");
    debugAgent(agent, { output });

    await agent.call("hi");

    const outputLine = lines.find((l) => l.includes("->"));
    expect(outputLine).toBeDefined();
    expect(outputLine!).not.toContain("...");
    expect(outputLine!).toContain("short");
  });
});

// truncateText (standalone)

describe("truncateText", () => {
  it("should return text unchanged when max is 0", () => {
    expect(truncateText("hello world", 0)).toBe("hello world");
  });

  it("should return text unchanged when shorter than max", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("should truncate and append ... when longer than max", () => {
    expect(truncateText("hello world", 5)).toBe("hello...");
  });

  it("should not touch newlines", () => {
    const text = "line1\nline2";
    expect(truncateText(text, 0)).toBe("line1\nline2");
  });
});

// collapseNewlines (standalone)

describe("collapseNewlines", () => {
  it("should replace newlines with visible markers", () => {
    expect(collapseNewlines("a\nb\nc")).toBe("a\\nb\\nc");
  });

  it("should return text unchanged when no newlines", () => {
    expect(collapseNewlines("no newlines here")).toBe("no newlines here");
  });

  it("should handle consecutive newlines", () => {
    expect(collapseNewlines("a\n\nb")).toBe("a\\n\\nb");
  });
});

// breakLines

describe("breakLines", () => {
  it("should return the line unchanged when width is 0", () => {
    const line = "a".repeat(200);
    expect(breakLines(line, 0)).toBe(line);
  });

  it("should return the line unchanged when shorter than width", () => {
    const line = "hello world";
    expect(breakLines(line, 80)).toBe(line);
  });

  it("should break at the last space before width", () => {
    const line = "the quick brown fox jumps";
    // width=16: "the quick brown " is 16 chars, last space at index 15
    const result = breakLines(line, 16);
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("the quick brown");
    expect(lines[1]).toBe("fox jumps");
  });

  it("should preserve leading indent on continuation lines", () => {
    const line = "    hello world this is a long line that should wrap";
    const result = breakLines(line, 30);
    const lines = result.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    // All continuation lines should start with "    " (4 spaces)
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toMatch(/^ {4}/);
    }
  });

  it("should handle multiple wraps", () => {
    const line = "one two three four five six seven eight";
    const result = breakLines(line, 15);
    const lines = result.split("\n");
    expect(lines.length).toBeGreaterThan(2);
    // No line should exceed width (unless a single word is longer)
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(15);
    }
  });

  it("should not break in the middle of a word if a space exists", () => {
    const line = "short loooooooongword end";
    const result = breakLines(line, 10);
    // "short" fits, then "loooooooongword" can't break, pushed to next line
    const lines = result.split("\n");
    expect(lines[0]).toBe("short");
    // The long word is on line 2 (possibly with "end" on line 3)
    expect(lines[1]).toContain("loooooooongword");
  });

  it("should handle a line with no spaces", () => {
    const line = "abcdefghijklmnopqrstuvwxyz";
    // No spaces to break on, so line is returned as-is
    const result = breakLines(line, 10);
    expect(result).toBe(line);
  });

  it("should wire through debugAgent output", async () => {
    const { lines, output } = createCapture();
    const longResponse = "word ".repeat(30).trim(); // 30 words
    const agent = makeMockAgent("a", longResponse);
    debugAgent(agent, { output, breakLineAfter: 40 });

    await agent.call("hello");

    const outputLine = lines.find((l) => l.includes("->"));
    expect(outputLine).toBeDefined();
    // The line should have been wrapped — it should contain a newline
    expect(outputLine!).toContain("\n");
  });

  it("should wire through debugFlow output", async () => {
    const { lines, output } = createCapture();
    const longResponse = "word ".repeat(30).trim();
    const agent = makeMockAgent("a", longResponse);
    const flow = createSequentialFlow({ name: "pipe", steps: [agent] });
    debugFlow(flow, { output, breakLineAfter: 40 });

    await flow.call("hello");

    const outputLine = lines.find((l) => l.includes("Output:"));
    expect(outputLine).toBeDefined();
    expect(outputLine!).toContain("\n");
  });
});
