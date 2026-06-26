import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { ToolSet } from "ai";

import { resolveMcpServer } from "./mcp.config";
import type {
  CreateMcpConnectionManagerOptions,
  McpAgentToolSet,
  McpConnectionManager,
  McpServerEntry,
  McpServerStatus,
  McpServerToolSet,
  McpToolOrigin,
} from "./mcp.types";

/** Connect enabled MCP servers and retain their clients for run-scoped cleanup. */
export async function createMcpConnectionManager({
  servers,
  enabledServerIds,
  env = process.env,
}: CreateMcpConnectionManagerOptions): Promise<McpConnectionManager> {
  const enabledIds = new Set(enabledServerIds);
  const clients = new Map<string, MCPClient>();
  const toolSets = new Map<string, McpServerToolSet>();
  const statuses: McpServerStatus[] = [];
  let closed = false;

  for (const entry of servers.values()) {
    if (!enabledIds.has(entry.id)) {
      statuses.push(toStatus(entry, false, false, 0));
      continue;
    }

    let client: MCPClient | undefined;
    try {
      client = await connectMcpServer(entry, env);
      const discoveredTools = await client.tools();
      const toolSet = namespaceMcpTools(entry.id, discoveredTools);
      clients.set(entry.id, client);
      toolSets.set(entry.id, toolSet);
      statuses.push(
        toStatus(entry, true, true, Object.keys(toolSet.tools).length),
      );
    } catch (caughtError) {
      await client?.close().catch(() => undefined);
      statuses.push(
        toStatus(
          entry,
          true,
          false,
          0,
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
        ),
      );
    }
  }

  return {
    statuses,

    toolsFor(serverIds): McpAgentToolSet {
      const tools: ToolSet = {};
      const origins: Record<string, McpToolOrigin> = {};
      for (const serverId of serverIds) {
        const toolSet = toolSets.get(serverId);
        if (!toolSet) continue;
        for (const [toolName, tool] of Object.entries(toolSet.tools)) {
          if (tools[toolName]) {
            throw new Error(
              `Duplicate MCP tool name after namespacing: ${toolName}`,
            );
          }
          tools[toolName] = tool;
          origins[toolName] = toolSet.origins[toolName]!;
        }
      }
      return { tools, origins };
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await Promise.allSettled(
        Array.from(clients.values(), (client) => client.close()),
      );
      clients.clear();
      toolSets.clear();
    },
  };
}

/** Encode server and tool identity into a collision-resistant model-facing name. */
export function namespaceMcpToolName(
  serverId: string,
  toolName: string,
): string {
  return `mcp__${Buffer.from(serverId).toString("base64url")}__${Buffer.from(toolName).toString("base64url")}`;
}

/** Recover MCP origin metadata from a namespaced tool name. */
export function parseMcpToolName(
  namespacedToolName: string,
): McpToolOrigin | undefined {
  const match = /^mcp__([A-Za-z0-9_-]+)__([A-Za-z0-9_-]+)$/.exec(
    namespacedToolName,
  );
  if (!match) return undefined;
  try {
    return {
      serverId: Buffer.from(match[1]!, "base64url").toString("utf8"),
      toolName: Buffer.from(match[2]!, "base64url").toString("utf8"),
    };
  } catch {
    return undefined;
  }
}

async function connectMcpServer(
  entry: McpServerEntry,
  env: Readonly<Record<string, string | undefined>>,
): Promise<MCPClient> {
  const resolved = resolveMcpServer(entry, env);
  if (resolved.transport === "stdio") {
    return createMCPClient({
      name: `comma-${entry.id}`,
      transport: new Experimental_StdioMCPTransport({
        command: resolved.command,
        ...(resolved.args ? { args: [...resolved.args] } : {}),
        ...(resolved.cwd ? { cwd: resolved.cwd } : {}),
        ...(resolved.env ? { env: { ...resolved.env } } : {}),
      }),
    });
  }

  return createMCPClient({
    name: `comma-${entry.id}`,
    transport: {
      type: resolved.transport,
      url: resolved.url,
      ...(resolved.headers ? { headers: { ...resolved.headers } } : {}),
    },
  });
}

function namespaceMcpTools(
  serverId: string,
  discoveredTools: Readonly<ToolSet>,
): McpServerToolSet {
  const tools: ToolSet = {};
  const origins: Record<string, McpToolOrigin> = {};
  for (const [toolName, tool] of Object.entries(discoveredTools)) {
    const namespacedName = namespaceMcpToolName(serverId, toolName);
    tools[namespacedName] = tool;
    origins[namespacedName] = { serverId, toolName };
  }
  return { tools, origins };
}

function toStatus(
  entry: McpServerEntry,
  enabled: boolean,
  connected: boolean,
  toolCount: number,
  error?: string,
): McpServerStatus {
  return {
    id: entry.id,
    source: entry.source,
    transport: entry.definition.transport,
    enabled,
    connected,
    toolCount,
    ...(error ? { error } : {}),
  };
}
