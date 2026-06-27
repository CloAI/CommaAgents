import { expect } from "bun:test";
import { join } from "node:path";

import { createSimpleSuccessScenario, startMockDaemon } from "../mock-daemon";
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
  waitForFile,
  withTuiE2e,
} from "../test-utils";

const STRATEGY_NAME = "Settings Strategy";
const USER_PROMPT = "open settings after run";

describeTuiE2e("TUI shell-use E2E: menu settings", () => {
  withTuiE2e(
    "should update and persist the selected theme",
    async ({ sessionName }) => {
      const workspace = createTuiE2eWorkspace({
        strategies: [{ name: STRATEGY_NAME }],
      });
      const mockDaemon = startMockDaemon({
        strategyName: STRATEGY_NAME,
        scenario: createSimpleSuccessScenario(),
      });

      try {
        await startTuiSession({
          sessionName,
          workspaceDir: workspace.workspaceDir,
          daemonUrl: mockDaemon.url,
          strategy: STRATEGY_NAME,
          input: USER_PROMPT,
          env: workspace.env,
        });
        await waitForText(sessionName, "[Done]", 15_000);

        await pressKeys(sessionName, ["Ctrl+P"]);
        await waitForText(sessionName, "Command Palette", 5_000);
        await waitForText(sessionName, "Change theme", 5_000);
        await clickText(sessionName, "Change theme");
        await waitForText(sessionName, "Theme", 5_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "menu-settings-open");

        await clickText(sessionName, "Light");
        await waitForText(sessionName, "● Light", 5_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "menu-settings-light");

        const configFilePath = join(
          workspace.homeDir,
          ".comma",
          "tui-config.json",
        );
        await waitForFile(configFilePath);
        const config = JSON.parse(await Bun.file(configFilePath).text()) as {
          readonly themeName?: string;
        };
        expect(config.themeName).toBe("light");
      } finally {
        mockDaemon.stop();
        workspace.cleanup();
      }
    },
  );
});
