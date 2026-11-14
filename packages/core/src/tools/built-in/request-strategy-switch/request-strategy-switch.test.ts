import type { QuestionsRequest } from "../../../questions";
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { makeToolContext } from "../../test.utils";
import { createRequestStrategySwitchTool } from "./request-strategy-switch";
import type { StrategySwitchRequest } from "./request-strategy-switch.types";

const workspaces: string[] = [];

function workspaceWithStrategy(): string {
  const cwd = mkdtempSync(join(tmpdir(), "strategy-switch-"));
  workspaces.push(cwd);
  mkdirSync(join(cwd, ".comma", "strategies"), { recursive: true });
  writeFileSync(
    join(cwd, ".comma", "strategies", "build.json"),
    JSON.stringify({
      name: "Build",
      version: "1.0",
      agents: { user: { type: "user" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "user" }] },
    }),
  );
  return cwd;
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe("createRequestStrategySwitchTool", () => {
  it("should queue the switch when the user approves", async () => {
    const cwd = workspaceWithStrategy();
    const queued: StrategySwitchRequest[] = [];
    const questions: string[] = [];
    const result = await createRequestStrategySwitchTool().execute(
      { strategy: "build", reason: "The plan is approved." },
      makeToolContext({
        sandbox: createSandbox({ cwd }),
        requestQuestions: async ({
          questions: questionnaire,
        }: QuestionsRequest) => {
          questions.push(questionnaire[0]!.prompt);
          return {
            answers: [
              {
                questionId: "strategy-switch",
                type: "answered",
                values: { decision: ["switch"] },
              },
            ],
          };
        },
        requestStrategySwitch: async (request: StrategySwitchRequest) => {
          queued.push(request);
        },
      }),
    );

    expect(questions).toEqual([
      "Switch this conversation to Build? The plan is approved.",
    ]);
    expect(queued).toEqual([
      { strategyPath: join(cwd, ".comma", "strategies", "build.json") },
    ]);
    expect(result.data).toEqual({
      strategyName: "Build",
      approved: true,
      response: {
        answers: [
          {
            questionId: "strategy-switch",
            type: "answered",
            values: { decision: ["switch"] },
          },
        ],
      },
    });
  });

  it("should not queue anything when the user declines", async () => {
    const cwd = workspaceWithStrategy();
    const queued: StrategySwitchRequest[] = [];
    const result = await createRequestStrategySwitchTool().execute(
      { strategy: "Build", reason: "Ready." },
      makeToolContext({
        sandbox: createSandbox({ cwd }),
        requestQuestions: async () => ({
          answers: [
            {
              questionId: "strategy-switch",
              type: "other",
              text: "not yet, revise step 2",
            },
          ],
        }),
        requestStrategySwitch: async (request: StrategySwitchRequest) => {
          queued.push(request);
        },
      }),
    );

    expect(queued).toEqual([]);
    expect(result.data?.approved).toBe(false);
  });

  it("should refuse when the runtime cannot switch", async () => {
    const result = await createRequestStrategySwitchTool().execute(
      { strategy: "Build", reason: "Ready." },
      makeToolContext({
        requestQuestions: async () => ({
          answers: [{ questionId: "strategy-switch", type: "skipped" }],
        }),
      }),
    );

    expect(result.ok).toBe(false);
  });
});

it("should decline skips and reject incomplete structured approvals", async () => {
  const cwd = workspaceWithStrategy();
  const queued: StrategySwitchRequest[] = [];
  for (const response of [
    { answers: [{ questionId: "strategy-switch", type: "skipped" as const }] },
    {
      answers: [
        {
          questionId: "strategy-switch",
          type: "answered" as const,
          values: {},
        },
      ],
    },
  ]) {
    const result = await createRequestStrategySwitchTool().execute(
      { strategy: "Build", reason: "Ready." },
      makeToolContext({
        sandbox: createSandbox({ cwd }),
        requestQuestions: async () => response,
        requestStrategySwitch: async (request: StrategySwitchRequest) => {
          queued.push(request);
        },
      }),
    );
    expect(result.data?.approved ?? false).toBe(false);
  }
  expect(queued).toEqual([]);
});
