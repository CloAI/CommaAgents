import { createSpawnedStrategyScenario, startMockDaemon } from "../mock-daemon";
import {
  clickText,
  expectTerminalSnapshot,
  pressKeys,
  startTuiSession,
  waitForText,
  waitIdle,
} from "../shell-use";
import {
  createTuiE2eWorkspace,
  describeTuiE2e,
  withTuiE2e,
} from "../test-utils";

const STRATEGY_NAME = "Spawn Parent Strategy";
const AGENT_NAME = "parent";

describeTuiE2e("TUI shell-use E2E: spawned strategy", () => {
  withTuiE2e(
    "should open a spawned strategy detail page",
    async ({ sessionName }) => {
      const workspace = createTuiE2eWorkspace({
        strategies: [{ name: STRATEGY_NAME, agentName: AGENT_NAME }],
      });
      const mockDaemon = startMockDaemon({
        strategyName: STRATEGY_NAME,
        agentName: AGENT_NAME,
        scenario: createSpawnedStrategyScenario(),
      });

      try {
        await startTuiSession({
          sessionName,
          workspaceDir: workspace.workspaceDir,
          daemonUrl: mockDaemon.url,
          strategy: STRATEGY_NAME,
          input: "launch child strategy",
          env: workspace.env,
        });

        await waitForText(sessionName, "spawned Child Strategy", 15_000);
        await waitForText(sessionName, "open", 15_000);
        await waitForText(sessionName, "[Done]", 15_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "spawned-strategy-nested");

        await clickText(sessionName, "open");
        await waitForText(sessionName, "Esc back", 5_000);
        await waitForText(
          sessionName,
          "Child strategy produced nested details.",
          5_000,
        );
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "spawned-strategy-detail");

        await pressKeys(sessionName, ["Escape"]);
        await waitForText(
          sessionName,
          "Parent observed the spawned result.",
          5_000,
        );
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "spawned-strategy-returned");
      } finally {
        mockDaemon.stop();
        workspace.cleanup();
      }
    },
  );
});
