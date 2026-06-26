import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  discoverMcpConfig,
  resolveMcpServer,
  resolveMcpValue,
} from "./mcp.config";
import { McpConfigFileSchema } from "./mcp.schema";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = join(
    process.cwd(),
    ".tmp",
    `mcp-config-${crypto.randomUUID()}`,
  );
  mkdirSync(directory, { recursive: true });
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("McpConfigFileSchema", () => {
  it("should accept strict HTTP, SSE, and stdio definitions", () => {
    const parsed = McpConfigFileSchema.parse({
      mcpServers: {
        remote: {
          transport: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: { env: "MCP_TOKEN" } },
        },
        events: { transport: "sse", url: "https://example.com/sse" },
        local: {
          transport: "stdio",
          command: "bunx",
          args: ["server-package"],
          env: { TOKEN: { env: "MCP_TOKEN" } },
        },
      },
    });

    expect(parsed.mcpServers).toHaveProperty("remote");
  });

  it("should reject unknown server fields", () => {
    expect(
      McpConfigFileSchema.safeParse({
        mcpServers: {
          invalid: {
            transport: "http",
            url: "https://example.com/mcp",
            token: "secret",
          },
        },
      }).success,
    ).toBe(false);
  });
});

describe("discoverMcpConfig", () => {
  it("should let workspace definitions override global definitions", () => {
    const root = createTemporaryDirectory();
    const dataDir = join(root, "data");
    const workspace = join(root, "workspace");
    mkdirSync(join(workspace, ".comma"), { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          shared: { transport: "http", url: "https://global.example/mcp" },
          globalOnly: { transport: "sse", url: "https://global.example/sse" },
        },
      }),
    );
    writeFileSync(
      join(workspace, ".comma", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          shared: {
            transport: "stdio",
            command: "workspace-server",
            enabledByDefault: true,
          },
        },
      }),
    );

    const discovery = discoverMcpConfig({ cwd: workspace, dataDir });

    expect(discovery.servers.get("shared")?.source).toBe("workspace");
    expect(discovery.servers.get("shared")?.definition.transport).toBe("stdio");
    expect(discovery.servers.get("globalOnly")?.source).toBe("global");
  });
});

describe("resolveMcpValue", () => {
  it("should resolve environment references", () => {
    expect(resolveMcpValue({ env: "MCP_TOKEN" }, { MCP_TOKEN: "secret" })).toBe(
      "secret",
    );
    expect(() => resolveMcpValue({ env: "MISSING" }, {})).toThrow(
      "Missing environment variable: MISSING",
    );
  });

  it("should resolve stdio paths relative to the definition base directory", () => {
    const entry = {
      id: "local",
      source: "workspace" as const,
      baseDir: "/workspace/.comma",
      definition: {
        transport: "stdio" as const,
        command: { env: "MCP_COMMAND" },
        args: ["--token", { env: "MCP_TOKEN" }],
        cwd: "../tools",
      },
    };

    expect(
      resolveMcpServer(entry, {
        MCP_COMMAND: "bun",
        MCP_TOKEN: "secret",
      }),
    ).toEqual({
      transport: "stdio",
      command: "bun",
      args: ["--token", "secret"],
      cwd: "/workspace/tools",
    });
  });
});
