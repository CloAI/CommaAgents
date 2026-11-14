import { vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import { resetModelRegistry } from "../../../../core/src/model/model";
import * as runLoader from "./preparation/loading/strategy-loader";
import { createRunsPlugin } from "./runs";

export const directories: string[] = [];
const dependencyMocks: Array<{ mockRestore(): void }> = [];

export function cleanupRunFixtures(): void {
  for (const dependencyMock of dependencyMocks.splice(0)) {
    dependencyMock.mockRestore();
  }
  resetModelRegistry();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function createRunDirectory() {
  const runsDir = mkdtempSync(join(tmpdir(), "runs-plugin-"));
  directories.push(runsDir);
  return runsDir;
}

export function createMockRunsPlugin(options: {
  readonly runsDir: string;
  readonly loadStrategy: typeof runLoader.loadRunStrategy;
}) {
  dependencyMocks.push(
    vi
      .spyOn(runLoader, "loadRunStrategy")
      .mockImplementation(options.loadStrategy),
  );
  return createRunsPlugin({ runsDir: options.runsDir });
}

function result(text: string): AgentCallResult {
  return {
    text,
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: 2 },
    responseMessages: [],
    steps: [],
  };
}

export function fakeLoader(observed: {
  loads: string[];
  restored: string[][];
}): typeof runLoader.loadRunStrategy {
  return async ({
    runId,
    inputCollector,
    launchStrategy,
    requestStrategySwitch,
  }) => {
    observed.loads.push(runId);
    const agentHooks = new Map<string, Array<(value: unknown) => unknown>>();
    const flowHooks = new Map<string, Array<(value: unknown) => unknown>>();
    const records: Array<Record<string, unknown>> = [];
    const agent = {
      name: "writer",
      appendHook(name: string, hook: (value: unknown) => unknown) {
        agentHooks.set(name, [...(agentHooks.get(name) ?? []), hook]);
      },
      getConversationContext() {
        return {
          records: () => records,
          clear() {
            records.length = 0;
          },
          importRecords(imported: Array<Record<string, unknown>>) {
            observed.restored.push(imported.map((item) => String(item.id)));
            records.push(...imported);
          },
        };
      },
    };
    const flow = {
      appendHook(name: string, hook: (value: unknown) => unknown) {
        flowHooks.set(name, [...(flowHooks.get(name) ?? []), hook]);
      },
      call(input: string) {
        const controller = new AbortController();
        const promise = (async () => {
          for (const hook of flowHooks.get("beforeStep") ?? []) {
            await hook({ stepName: "writer", message: input });
          }
          const identity = {
            messageId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
          for (const hook of agentHooks.get("onCallStarted") ?? []) {
            await hook(identity);
          }
          let output = input;
          if (input === "needs-input") {
            const answers = await Promise.all([
              inputCollector({ agentName: "writer", prompt: "First" }),
              inputCollector({ agentName: "writer", prompt: "Second" }),
            ]);
            output = answers.join(",");
          }
          if (input === "child" || input === "nested") {
            const child = await launchStrategy({
              strategyPath: "child.json",
              input: input === "nested" ? "child" : "child message",
            });
            output = child.text;
          }
          if (input === "switch-me" && requestStrategySwitch) {
            await requestStrategySwitch({ strategyPath: "/work/build.json" });
            output = await inputCollector({
              agentName: "user",
              prompt: "Next?",
            });
          }
          if (input === "limited") {
            output = await launchStrategy({
              strategyPath: "child.json",
              input: "limited",
              maxDepth: 1,
            }).then(
              (child) => child.text,
              (launchError: Error) => launchError.message,
            );
          }
          if (controller.signal.aborted) {
            throw new DOMException("Stopped", "AbortError");
          }
          const callResult = { ...result(output), ...identity };
          for (const text of ["first chunk", "second chunk"]) {
            for (const hook of agentHooks.get("onStreamEvent") ?? []) {
              await hook({ ...identity, type: "text", text });
            }
          }
          records.push({
            id: identity.messageId,
            agentName: "writer",
            createdAt: identity.createdAt,
            userMessage: { role: "user", content: input },
            responseMessages: [],
            text: output,
            usage: callResult.usage,
            finishReason: callResult.finishReason,
          });
          for (const hook of [
            ...(agentHooks.get("onCallCompleted") ?? []),
            ...(agentHooks.get("afterCallResult") ?? []),
          ]) {
            await hook(callResult);
          }
          for (const hook of agentHooks.get("onStreamEvent") ?? []) {
            await hook({ ...identity, type: "done", result: callResult });
          }
          for (const hook of flowHooks.get("afterStep") ?? []) {
            await hook({
              stepName: "writer",
              message: input,
              result: callResult,
            });
          }
          return callResult;
        })();
        return Object.assign(promise, { abort: () => controller.abort() });
      },
    };
    return {
      name: "example",
      version: "1",
      raw: {
        flow: {
          name: "example",
          type: "sequential",
          steps: [{ agent: "writer" }],
        },
        agents: { writer: {} },
      },
      flow,
      agents: { writer: agent },
    } as unknown as LoadedStrategy;
  };
}
