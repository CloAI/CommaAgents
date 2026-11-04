import { afterEach, describe, expect, it } from "bun:test";
import { createAgent, createSequentialFlow } from "@comma-agents/core";
import type { Agent, AgentStreamEvent } from "@comma-agents/core";
import { withConfig, type LogRecord } from "@logtape/logtape";
import type { StrategyHookContext } from "../../runs.types";
import { RunOutcomeStatus } from "../../state/state.schemas";
import { attachExecutionLogging } from "./logging";
import { initializeLogging } from "../../../../logger";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  fakeLoader,
  repository,
} from "../../test.utils";

afterEach(cleanupRunFixtures);

function context(agent: Agent): StrategyHookContext {
  return {
    kind: "child",
    parentRunId: "parent",
    runId: "child",
    strategyPath: "/work/strategy.json",
    cwd: "/work",
    signal: new AbortController().signal,
    strategy: {
      name: "test",
      version: "1",
      agents: { writer: agent },
      flow: createSequentialFlow({ name: "test", steps: [agent] }),
      raw: {
        name: "test",
        version: "1",
        agents: { writer: { model: "mock/model" } },
        flow: {
          name: "test",
          type: "sequential",
          steps: [{ agent: "writer" }],
        },
      },
    },
  };
}

async function capture(run: () => Promise<void>): Promise<LogRecord[]> {
  const records: LogRecord[] = [];
  const logging = initializeLogging({ stderr: false });
  try {
    await withConfig(
      {
        sinks: {
          capture: (record) => {
            records.push(record);
          },
        },
        loggers: [
          { category: ["comma"], lowestLevel: "debug", sinks: ["capture"] },
        ],
      },
      run,
    );
  } finally {
    logging.close();
  }
  return records;
}

describe("attachExecutionLogging", () => {
  it("should log enabled privacy requirements without claiming verification", async () => {
    const agent = createAgent({
      name: "writer",
      model: "venice/model",
      privacy: { tee: "required", e2ee: "required" },
    });
    const records = await capture(async () => {
      attachExecutionLogging(context(agent));
      await expect(agent.call("private-input")).rejects.toThrow();
    });
    expect(
      records.find(
        (record) => record.rawMessage === "Privacy protection enabled",
      )?.properties,
    ).toMatchObject({
      runId: "child",
      agentName: "writer",
      messageId: expect.any(String),
      requirements: { tee: "required", e2ee: "required" },
    });
    expect(
      records.some(
        (record) => record.rawMessage === "Privacy verification passed",
      ),
    ).toBe(false);
    expect(JSON.stringify(records)).not.toContain("private-");
  });
  it("should attach registered logging to root, child and grandchild runs", async () => {
    const runs = createMockRunsPlugin({
      repository: repository(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    runs.registerStrategyHooks({
      name: "logging",
      attach: (context) => attachExecutionLogging(context),
    });
    try {
      const records = await capture(async () => {
        await runs.prepareRun({
          runId: "parent",
          configuration: { strategyPath: "example.json" },
        });
        expect(
          (await runs.startRun("parent", "nested").completion).status,
        ).toBe(RunOutcomeStatus.completed);
      });
      const started = records.filter(
        (record) => record.rawMessage === "Agent invocation started",
      );
      expect(started).toHaveLength(3);
      expect(started[0]?.properties.runId).toBe("parent");
      expect(started[1]?.properties.parentRunId).toBe("parent");
      expect(started[2]?.properties.parentRunId).toBe(
        started[1]?.properties.runId,
      );
      expect(
        records.filter(
          (record) => record.rawMessage === "Agent invocation completed",
        ),
      ).toHaveLength(3);
    } finally {
      await runs.dispose();
    }
  });
  it("should correlate child invocations, usage and duration without payloads", async () => {
    const agent = createAgent({
      name: "writer",
      systemPrompt: "secret-system",
      execute: async () => ({
        text: "secret-response",
        responseMessages: [],
        steps: [],
        finishReason: "stop",
        usage: { promptTokens: 12, completionTokens: 7 },
      }),
    });
    const records = await capture(async () => {
      attachExecutionLogging(context(agent));
      await agent.call("secret-input");
      await agent.call("secret-second-input");
    });
    expect(records.map((record) => record.rawMessage)).toEqual([
      "Agent invocation started",
      "Agent invocation completed",
      "Agent invocation started",
      "Agent invocation completed",
    ]);
    expect(records[1]?.properties).toMatchObject({
      runId: "child",
      parentRunId: "parent",
      agentName: "writer",
      finishReason: "stop",
      usage: { promptTokens: 12, completionTokens: 7 },
      durationMs: expect.any(Number),
      messageId: records[0]?.properties.messageId,
    });
    expect(records[0]?.properties.messageId).not.toBe(
      records[2]?.properties.messageId,
    );
    expect(JSON.stringify(records)).not.toContain("secret-");
  });

  it("should include complete agent payloads only when enabled", async () => {
    const response = "full-response".repeat(3000);
    const agent = createAgent({
      name: "writer",
      systemPrompt: "system-input",
      execute: async () => response,
    });
    const records = await capture(async () => {
      attachExecutionLogging(context(agent), true);
      await agent.call("full-input");
    });
    expect(
      records.find((record) => record.rawMessage === "Agent input")?.properties,
    ).toMatchObject({
      input: "full-input",
      systemPrompt: "system-input",
    });
    expect(
      records.find((record) => record.rawMessage === "Agent response")
        ?.properties,
    ).toMatchObject({
      text: response,
      userMessage: { role: "user", content: "full-input" },
    });
  });

  it("should log invocation errors and cancellation", async () => {
    for (const cancelled of [false, true]) {
      let fail: (error: Error) => void = () => {};
      let ready: () => void = () => {};
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const agent = createAgent({
        name: "writer",
        execute: () =>
          new Promise<string>((resolve, reject) => {
            fail = reject;
            if (cancelled) {
              ready();
            } else {
              resolve("unused");
            }
          }),
      });
      if (!cancelled) {
        const failedAgent = createAgent({
          name: "writer",
          execute: async () => {
            throw new Error("execution failed");
          },
        });
        const records = await capture(async () => {
          attachExecutionLogging(context(failedAgent));
          await expect(failedAgent.call("input")).rejects.toThrow();
        });
        expect(records.at(-1)?.rawMessage).toBe("Agent invocation failed");
        expect(records.at(-1)?.level).toBe("error");
      } else {
        const records = await capture(async () => {
          attachExecutionLogging(context(agent));
          const call = agent.call("input");
          await entered;
          call.abort();
          fail(new DOMException("Stopped", "AbortError"));
          await expect(call).rejects.toThrow();
        });
        expect(records.at(-1)?.rawMessage).toBe("Agent invocation cancelled");
        expect(records.at(-1)?.properties.cancelled).toBe(true);
      }
    }
  });

  it("should observe concurrent MCP tools, tool errors and interrupted tools", async () => {
    for (const logPayloads of [false, true]) {
      const hooks = new Map<string, (value: unknown) => void>();
      const agent = createAgent({
        name: "writer",
        execute: async () => "unused",
      });
      agent.appendHook = (name, callback) => {
        hooks.set(name, callback as (value: unknown) => void);
      };
      const emit = (event: AgentStreamEvent) =>
        hooks.get("onStreamEvent")?.(event);
      const records = await capture(async () => {
        attachExecutionLogging(context(agent), logPayloads);
        hooks.get("onCallStarted")?.({
          messageId: "one",
          createdAt: new Date().toISOString(),
        });
        for (const toolCallId of ["a", "b", "c"]) {
          emit({
            type: "tool-call",
            messageId: "one",
            toolCallId,
            toolName: "lookup",
            args: "secret-args",
            mcp: { serverId: "test-server", toolName: "lookup" },
          });
        }
        emit({
          type: "tool-result",
          messageId: "one",
          toolCallId: "b",
          toolName: "lookup",
          status: "error",
          error: "tool failed",
          output: "secret-result",
        });
        emit({
          type: "tool-result",
          messageId: "one",
          toolCallId: "a",
          toolName: "lookup",
          status: "completed",
          output: "secret-result",
        });
        hooks.get("onCallFailed")?.({
          messageId: "one",
          cancelled: true,
          error: new Error("Stopped"),
        });
      });
      expect(
        records.find((record) => record.rawMessage === "Tool failed")
          ?.properties,
      ).toMatchObject({
        toolCallId: "b",
        status: "error",
        durationMs: expect.any(Number),
      });
      expect(
        records.find((record) => record.rawMessage === "Tool started")
          ?.properties.mcp,
      ).toEqual({ serverId: "test-server", toolName: "lookup" });
      expect(
        records.find((record) => record.rawMessage === "Tool completed")
          ?.properties.toolCallId,
      ).toBe("a");
      expect(
        records.find((record) => record.rawMessage === "Tool interrupted")
          ?.properties.toolCallId,
      ).toBe("c");
      expect(JSON.stringify(records).includes("secret-")).toBe(logPayloads);
    }
  });
});
