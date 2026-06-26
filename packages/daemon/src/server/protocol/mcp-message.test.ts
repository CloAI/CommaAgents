import { describe, expect, it } from "bun:test";

import { parseClientMessage, parseDaemonMessage } from "./messages";

describe("MCP protocol messages", () => {
  it("should parse list and update requests", () => {
    expect(
      parseClientMessage({
        type: "list_mcp_servers",
        cwd: "/workspace",
        runId: "run-1",
      }).success,
    ).toBe(true);
    expect(
      parseClientMessage({
        type: "update_mcp_server",
        serverId: "github",
        enabled: false,
        scope: "run",
        runId: "run-1",
      }).success,
    ).toBe(true);
  });

  it("should parse safe MCP server status replies", () => {
    const result = parseDaemonMessage({
      type: "mcp_server_list",
      ts: "2026-06-24T12:00:00.000Z",
      servers: [
        {
          id: "github",
          source: "workspace",
          transport: "http",
          enabled: true,
          enabledByDefault: true,
          connected: false,
          toolCount: 0,
          assignedAgents: ["assistant"],
          error: "Connection refused",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("should default missing run_prepared MCP status for older daemons", () => {
    const result = parseDaemonMessage({
      type: "run_prepared",
      ts: "2026-06-24T12:00:00.000Z",
      runId: "run-1",
      strategyName: "Test",
      agents: ["assistant"],
      flowTree: {},
      conversation: { records: [], retentionEvents: [], inputs: [] },
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.type === "run_prepared") {
      expect(result.data.mcpServers).toEqual([]);
    }
  });
});
