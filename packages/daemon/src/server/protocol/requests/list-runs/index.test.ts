import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunSystem } from "../../../../run-system";
import { createDaemonState } from "../../../../state";
import { mockLogger, mockSink } from "../../../../test.utils";
import type { RunListMessage } from "../../responses/run-list";
import { handleListRuns } from ".";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("handleListRuns", () => {
  it("lists persisted runs through the run system's exposed store", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "comma-agents-list-runs-"));
    tempDirs.push(runsDir);
    const runSystem = createRunSystem({
      state: createDaemonState(),
      sink: mockSink(),
      logger: mockLogger(),
      runsDir,
    });
    await runSystem.runStore.appendEvent("run-1", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      cwd: "/workspace",
      strategyName: "Test",
      strategyPath: "/strategy.json",
    });
    await runSystem.runStore.appendEvent("other-run", {
      type: "run_started",
      ts: new Date(1).toISOString(),
      cwd: "/other-workspace",
      strategyName: "Other",
      strategyPath: "/other-strategy.json",
    });
    let response: RunListMessage | undefined;

    await handleListRuns(
      { type: "list_runs", cwd: "/workspace", requestId: "request-1" },
      {
        clientId: "client-1",
        runSystem,
        state: createDaemonState(),
        logger: mockLogger(),
        reply(message) {
          if (message.type === "run_list") response = message;
        },
      },
    );

    expect(response?.runs).toHaveLength(1);
    expect(response?.runs[0]?.runId).toBe("run-1");
    expect(response?.requestId).toBe("request-1");
  });
});
