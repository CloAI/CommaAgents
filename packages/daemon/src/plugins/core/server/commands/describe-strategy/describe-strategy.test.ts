import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStrategyFromString } from "@comma-agents/core/strategy";
import { createDaemonKernel } from "../../../../../daemon-kernel/daemon-kernel";
import { createDaemonServer } from "../../../../../daemon-server/daemon-server";
import { connectSocket } from "../../../../../daemon-server/test.utils";
import { describeStrategy } from "./describe-strategy.utils";

const STRATEGY = {
  name: "describe-test",
  version: "1.0.0",
  description: "Plan, build, and review.",
  agents: {
    asker: { type: "user" },
    planner: {
      model: "openai/gpt-4o",
      description: "Plans the work.",
      privacy: { tee: "required", e2ee: "required" },
    },
    builder: { type: "llm", model: "anthropic/claude-sonnet" },
    reviewer: { model: "openai/gpt-4o" },
    unmodeled: {},
    tool: { type: "custom-agent" },
  },
  flow: {
    type: "sequential",
    name: "main",
    steps: [
      { agent: "asker", description: "Collect the goal" },
      { agent: "planner" },
      {
        type: "cycle",
        name: "loop",
        cycles: 2,
        observer: "reviewer",
        steps: [{ agent: "builder" }, { agent: "planner" }],
      },
    ],
  },
};

describe("describeStrategy", () => {
  const described = describeStrategy(
    parseStrategyFromString(JSON.stringify(STRATEGY), "json"),
  );

  it("should classify agents and keep declared models and privacy", () => {
    expect(described.agents).toEqual([
      { name: "asker", kind: "user" },
      {
        name: "planner",
        kind: "llm",
        description: "Plans the work.",
        model: "openai/gpt-4o",
        privacy: { tee: "required", e2ee: "required" },
      },
      { name: "builder", kind: "llm", model: "anthropic/claude-sonnet" },
      { name: "reviewer", kind: "llm", model: "openai/gpt-4o" },
      { name: "unmodeled", kind: "llm" },
      { name: "tool", kind: "custom" },
    ]);
  });

  it("should resolve model roles, preferring configured roles, and keep unresolvable roles by name", () => {
    const described = describeStrategy(
      parseStrategyFromString(
        JSON.stringify({
          name: "roles",
          version: "1.0",
          modelRoles: { primary: "openai/gpt-5", fast: "openai/gpt-5-mini" },
          agents: {
            lead: { model: "@primary" },
            scout: { model: "@fast" },
          },
          flow: {
            type: "sequential",
            name: "main",
            steps: [{ agent: "lead" }],
          },
        }),
        "json",
      ),
      { primary: "anthropic/claude-sonnet-5-5" },
    );
    expect(described.agents).toEqual([
      {
        name: "lead",
        kind: "llm",
        model: "anthropic/claude-sonnet-5-5",
        modelRole: "primary",
      },
      {
        name: "scout",
        kind: "llm",
        model: "openai/gpt-5-mini",
        modelRole: "fast",
      },
    ]);
    const unresolved = describeStrategy(
      parseStrategyFromString(
        JSON.stringify({
          name: "roles",
          version: "1.0",
          agents: { lead: { model: "@primary" } },
          flow: {
            type: "sequential",
            name: "main",
            steps: [{ agent: "lead" }],
          },
        }),
        "json",
      ),
    );
    expect(unresolved.agents).toEqual([
      { name: "lead", kind: "llm", modelRole: "primary" },
    ]);
  });

  it("should flatten steps in flow order with depth and the observer last in its flow", () => {
    expect(
      described.steps.map((step) => [
        step.flow,
        step.depth,
        step.agent,
        step.role,
      ]),
    ).toEqual([
      ["main", 0, "asker", "step"],
      ["main", 0, "planner", "step"],
      ["loop", 1, "builder", "step"],
      ["loop", 1, "planner", "step"],
      ["loop", 1, "reviewer", "observer"],
    ]);
    expect(described.steps[0]).toMatchObject({
      flowType: "sequential",
      description: "Collect the goal",
    });
    expect(described.steps[2]).toMatchObject({ flowType: "cycle" });
  });
});

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "describe-strategy-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("core.strategies.describe", () => {
  it("should describe a strategy file and fail without a response payload for a missing file", async () => {
    const path = join(directory, "strategy.json");
    await writeFile(path, JSON.stringify(STRATEGY));
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const requestId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId,
        command: "core.strategies.describe",
        arguments: { strategyPath: path },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        requestId,
        ok: true,
        data: { name: "describe-test", version: "1.0.0" },
      });

      const missingId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId: missingId,
        command: "core.strategies.describe",
        arguments: { strategyPath: join(directory, "missing.json") },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        requestId: missingId,
        ok: false,
      });

      client.send({
        type: "command",
        requestId: crypto.randomUUID(),
        command: "core.strategies.describe",
        arguments: {},
      });
      expect((await client.closed).code).toBe(1008);
    } finally {
      client.socket.close();
      await server.stop();
      await kernel.dispose();
    }
  });
});
