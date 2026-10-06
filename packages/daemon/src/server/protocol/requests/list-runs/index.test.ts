import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDaemonRunState,
  createRunRepository,
} from "../../../../daemon-run-state";
import { createDaemonStore } from "../../../daemon-store";
import { mockMessageSender } from "../../../../test.utils";
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
  it("should list persisted runs through the run-state service", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "comma-agents-list-runs-"));
    tempDirs.push(runsDir);
    const daemonRunState = createDaemonRunState({
      daemonStore: createDaemonStore(),
      messageSender: mockMessageSender(),
      runsDir,
    });
    const runStore = createRunRepository({ runsDir });
    await runStore.appendEvent("run-1", {
      type: "run_started",
      ts: new Date(0).toISOString(),
      cwd: "/workspace",
      strategyName: "Test",
      strategyPath: "/strategy.json",
    });
    await runStore.appendEvent("other-run", {
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
        daemonRunState,
        daemonStore: createDaemonStore(),
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
