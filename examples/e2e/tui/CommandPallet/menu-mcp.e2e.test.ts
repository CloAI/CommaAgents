import { expect } from "bun:test";
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
  withTuiE2e,
} from "../test-utils";

describeTuiE2e("TUI shell-use E2E: MCP menu", () => {
  withTuiE2e(
    "should open MCP servers and toggle a server",
    async ({ sessionName }) => {
      const strategyName = "MCP Strategy";
      const agentName = "echo";
      const workspace = createTuiE2eWorkspace({
        strategies: [{ name: strategyName, agentName }],
      });
      const mockDaemon = startMockDaemon({
        strategyName,
        agentName,
        scenario: createSimpleSuccessScenario(),
        mcpServers: [
          {
            id: "filesystem",
            source: "workspace",
            transport: "stdio",
            enabled: true,
            enabledByDefault: true,
            connected: true,
            toolCount: 3,
            assignedAgents: [agentName],
          },
          {
            id: "browser",
            source: "global",
            transport: "http",
            enabled: false,
            enabledByDefault: false,
            connected: true,
            toolCount: 2,
            assignedAgents: [agentName],
          },
        ],
      });

      try {
        await startTuiSession({
          sessionName,
          workspaceDir: workspace.workspaceDir,
          daemonUrl: mockDaemon.url,
          strategy: strategyName,
          input: "review MCP server choices",
          env: workspace.env,
        });

        await waitForText(sessionName, "[Done]", 15_000);
        await waitForText(sessionName, "[MCP 1/2]", 15_000);
        await clickText(sessionName, "MCP 1/2");
        await waitForText(sessionName, "Enter to toggle", 5_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "menu-mcp-open");

        await pressKeys(sessionName, ["Enter"]);
        const updateMessage =
          await mockDaemon.waitForClientMessage("update_mcp_server");
        expect(updateMessage.serverId).toBe("filesystem");
        expect(updateMessage.enabled).toBe(false);
        expect(updateMessage.scope).toBe("run");

        await waitForText(sessionName, "[MCP 0/2]", 5_000);
        await waitIdle(sessionName);
        await expectTerminalSnapshot(sessionName, "menu-mcp-toggled");
      } finally {
        mockDaemon.stop();
        workspace.cleanup();
      }
    },
  );
});
