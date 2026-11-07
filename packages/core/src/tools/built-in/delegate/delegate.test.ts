import { describe, expect, it } from "vitest";
import type { LaunchStrategyRequest } from "../../launch-strategy.types";
import { makeToolContext } from "../../test.utils";
import { createDelegateTool } from "./delegate";
import { parseStructuredAnswer } from "./delegate.utils";
import type { SubagentTarget } from "./delegate.types";

const subagents: SubagentTarget[] = [
  {
    name: "explore",
    description: "Search the codebase.",
    strategyPath: "/s/explore.json",
  },
  { name: "verify", strategyPath: "/s/verify.json" },
];

describe("createDelegateTool", () => {
  it("should run every task through the launcher and keep request order", async () => {
    const requests: LaunchStrategyRequest[] = [];
    const tool = createDelegateTool();
    const result = await tool.execute(
      {
        tasks: [
          {
            agent: "explore",
            description: "find parser",
            goal: "Locate the parser.",
            context: "TypeScript repo",
          },
          {
            agent: "verify",
            description: "check build",
            goal: "Run tests.",
            context: "",
          },
        ],
      },
      makeToolContext({
        subagents,
        launchStrategy: async (request: LaunchStrategyRequest) => {
          requests.push(request);
          return request.strategyPath === "/s/verify.json"
            ? { strategyName: "Verify", text: '{"verdict":"pass"}' }
            : { strategyName: "Explore", text: "src/parser.ts:12" };
        },
      }),
    );

    expect(requests.map((request) => request.input)).toEqual([
      "## Goal\nLocate the parser.\n\n## Context\nTypeScript repo",
      "## Goal\nRun tests.",
    ]);
    expect(requests.every((request) => request.maxDepth === 2)).toBe(true);
    expect(result.data?.results).toEqual([
      {
        agent: "explore",
        description: "find parser",
        ok: true,
        text: "src/parser.ts:12",
      },
      {
        agent: "verify",
        description: "check build",
        ok: true,
        text: '{"verdict":"pass"}',
        data: { verdict: "pass" },
      },
    ]);
  });

  it("should report a failed task without failing the others", async () => {
    const tool = createDelegateTool();
    const result = await tool.execute(
      {
        tasks: [
          { agent: "explore", description: "a", goal: "A", context: "" },
          { agent: "verify", description: "b", goal: "B", context: "" },
        ],
      },
      makeToolContext({
        subagents,
        launchStrategy: async (request: LaunchStrategyRequest) => {
          if (request.strategyPath === "/s/verify.json") {
            throw new Error("depth limit");
          }
          return { strategyName: "Explore", text: "done" };
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.data?.results.map((entry) => [entry.ok, entry.text])).toEqual(
      [
        [true, "done"],
        [false, "depth limit"],
      ],
    );
  });

  it("should reject subagents the agent was not given", async () => {
    const tool = createDelegateTool();
    const result = await tool.execute(
      {
        tasks: [
          { agent: "research", description: "x", goal: "X", context: "" },
        ],
      },
      makeToolContext({
        subagents,
        launchStrategy: async () => ({ strategyName: "", text: "" }),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("not_found");
  });

  it("should list the agent's subagents in its system prompt", async () => {
    const tool = createDelegateTool();
    const systemPrompt =
      typeof tool.systemPrompt === "function"
        ? await tool.systemPrompt(makeToolContext({ subagents }))
        : tool.systemPrompt;

    expect(systemPrompt).toContain("- explore: Search the codebase.");
    expect(systemPrompt).toContain("- verify");
    expect(systemPrompt).toContain("starts with fresh context");
  });
});

describe("parseStructuredAnswer", () => {
  it("should parse JSON inside a single code fence", () => {
    expect(
      parseStructuredAnswer('```json\n{"answer":"bun.lock"}\n```'),
    ).toEqual({ answer: "bun.lock" });
  });

  it("should leave prose unparsed", () => {
    expect(parseStructuredAnswer("The lockfile is bun.lock.")).toBeUndefined();
  });
});
