import { createToolInfoScenario, startMockDaemon } from "../mock-daemon";
import {
  clickText,
  expectNoText,
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

const STRATEGY_NAME = "Tool Info Strategy";
const AGENT_NAME = "inspector";

describeTuiE2e("TUI shell-use E2E: tool and context info", () => {
  withTuiE2e(
    "should open tool and context usage modals",
    async ({ sessionName }) => {
      const workspace = createTuiE2eWorkspace({
        strategies: [{ name: STRATEGY_NAME, agentName: AGENT_NAME }],
      });
      const mockDaemon = startMockDaemon({
        strategyName: STRATEGY_NAME,
        agentName: AGENT_NAME,
        scenario: createToolInfoScenario(),
      });

      try {
        await startTuiSession({
          sessionName,
          workspaceDir: workspace.workspaceDir,
          daemonUrl: mockDaemon.url,
          strategy: STRATEGY_NAME,
          input: "inspect package metadata",
          env: workspace.env,
        });

        await waitForText(sessionName, "read_file", 15_000);
        await waitForText(sessionName, "[Done]", 15_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "tool-info-chat");

        await clickText(sessionName, "read_file");
        await waitForText(sessionName, "tool-result: read_file", 5_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "tool-info-output-modal");

        await pressKeys(sessionName, ["Escape"]);
        await expectNoText(sessionName, "tool-result: read_file");
        await clickText(sessionName, "33k/128k");
        await waitForText(sessionName, "Context Usage: inspector", 5_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "tool-info-context-modal");
      } finally {
        mockDaemon.stop();
        workspace.cleanup();
      }
    },
  );
});
