import { expect } from "bun:test";

import { createSimpleSuccessScenario, startMockDaemon } from "../mock-daemon";
import {
  expectTerminalSnapshot,
  pressKeys,
  startTuiSession,
  typeText,
  waitForText,
  waitIdle,
} from "../shell-use";
import {
  createTuiE2eWorkspace,
  describeTuiE2e,
  withTuiE2e,
} from "../test-utils";

const PRIMARY_STRATEGY = "Alpha Strategy";
const SECONDARY_STRATEGY = "Beta Strategy";
const AGENT_NAME = "echo";
const USER_PROMPT = "hello from intro workflow";
const RESPONSE_TEXT = `Mock daemon response for: ${USER_PROMPT}`;

describeTuiE2e("TUI shell-use E2E: strategy submission", () => {
  withTuiE2e(
    "should select a strategy and submit a prompt",
    async ({ sessionName }) => {
      const workspace = createTuiE2eWorkspace({
        strategies: [
          { name: PRIMARY_STRATEGY, agentName: AGENT_NAME },
          { name: SECONDARY_STRATEGY, agentName: AGENT_NAME },
        ],
      });
      const mockDaemon = startMockDaemon({
        strategyName: SECONDARY_STRATEGY,
        agentName: AGENT_NAME,
        scenario: createSimpleSuccessScenario({
          responseText: () => RESPONSE_TEXT,
        }),
      });

      try {
        await startTuiSession({
          sessionName,
          workspaceDir: workspace.workspaceDir,
          daemonUrl: mockDaemon.url,
          env: workspace.env,
        });

        await waitForText(sessionName, "Enter your prompt...", 15_000);
        await pressKeys(sessionName, ["Tab"]);
        await waitForText(sessionName, SECONDARY_STRATEGY, 5_000);
        await typeText(sessionName, USER_PROMPT);
        await waitForText(sessionName, USER_PROMPT, 5_000);
        await pressKeys(sessionName, ["Enter"]);

        const prepareRunMessage =
          await mockDaemon.waitForClientMessage("prepare_run");
        expect(prepareRunMessage.cwd).toBe(workspace.workspaceDir);
        expect(prepareRunMessage.strategyPath).toBe(
          workspace.strategyPaths.get(SECONDARY_STRATEGY),
        );

        const startRunMessage =
          await mockDaemon.waitForClientMessage("start_run");
        expect(startRunMessage.runId).toBe(prepareRunMessage.runId);
        expect(startRunMessage.input).toBe(USER_PROMPT);

        await waitForText(sessionName, USER_PROMPT, 15_000);
        await waitForText(sessionName, RESPONSE_TEXT, 15_000);
        await waitForText(sessionName, "[Done]", 15_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "strategy-submit-completed");
      } finally {
        mockDaemon.stop();
        workspace.cleanup();
      }
    },
  );
});
