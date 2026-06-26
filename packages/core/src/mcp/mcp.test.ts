import { describe, expect, it } from "bun:test";

import {
  createMcpConnectionManager,
  namespaceMcpToolName,
  parseMcpToolName,
} from "./mcp";

describe("MCP tool names", () => {
  it("should round-trip arbitrary server and tool names", () => {
    const namespaced = namespaceMcpToolName(
      "github/workspace",
      "search repositories",
    );

    expect(namespaced).toMatch(/^mcp__/);
    expect(parseMcpToolName(namespaced)).toEqual({
      serverId: "github/workspace",
      toolName: "search repositories",
    });
  });

  it("should ignore ordinary registered tools", () => {
    expect(parseMcpToolName("read_file")).toBeUndefined();
  });
});

describe("createMcpConnectionManager", () => {
  it("should report resolution failures without exposing secret values", async () => {
    const manager = await createMcpConnectionManager({
      servers: new Map([
        [
          "remote",
          {
            id: "remote",
            source: "workspace",
            baseDir: "/workspace",
            definition: {
              transport: "http",
              url: "https://example.com/mcp",
              headers: { Authorization: { env: "MCP_SECRET" } },
            },
          },
        ],
      ]),
      enabledServerIds: ["remote"],
      env: {},
    });

    expect(manager.statuses).toEqual([
      {
        id: "remote",
        source: "workspace",
        transport: "http",
        enabled: true,
        connected: false,
        toolCount: 0,
        error: "Missing environment variable: MCP_SECRET",
      },
    ]);
    expect(JSON.stringify(manager.statuses)).not.toContain("secret-value");
    await manager.close();
  });
});
