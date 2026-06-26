import type { ToolSet } from "ai";
import type { z } from "zod";

import type {
  McpConfigFileSchema,
  McpServerDefinitionSchema,
  McpValueSchema,
} from "./mcp.schema";

/** A literal configuration value or an environment-variable reference. */
export type McpValue = z.infer<typeof McpValueSchema>;

/** Supported MCP server transport configuration. */
export type McpServerDefinition = z.infer<typeof McpServerDefinitionSchema>;

/** Parsed contents of an MCP configuration file. */
export type McpConfigFile = z.infer<typeof McpConfigFileSchema>;

/** Where an MCP server definition was discovered. */
export type McpServerSource = "global" | "workspace" | "strategy";

/** An MCP server definition with its discovery provenance. */
export interface McpServerEntry {
  /** Stable identifier referenced by strategies and run configuration. */
  readonly id: string;
  /** Validated transport configuration. */
  readonly definition: McpServerDefinition;
  /** Definition layer that supplied this entry. */
  readonly source: McpServerSource;
  /** Configuration file containing the definition, when file-backed. */
  readonly configPath?: string;
  /** Base directory used to resolve relative stdio working directories. */
  readonly baseDir: string;
}

/** Result of layered global/workspace MCP configuration discovery. */
export interface McpConfigDiscovery {
  /** Effective definitions after workspace entries override global entries. */
  readonly servers: ReadonlyMap<string, McpServerEntry>;
  /** Global configuration path, whether or not it currently exists. */
  readonly globalConfigPath: string;
  /** Workspace configuration path, whether or not it currently exists. */
  readonly workspaceConfigPath: string;
}

/** Options for discovering shared MCP configuration. */
export interface DiscoverMcpConfigOptions {
  /** Workspace whose `.comma/mcp.json` should be loaded. */
  readonly cwd?: string;
  /** Global CommaAgents data directory. */
  readonly dataDir?: string;
}

/** Resolved HTTP/SSE MCP transport configuration. */
export interface ResolvedMcpHttpServer {
  readonly transport: "http" | "sse";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/** Resolved stdio MCP transport configuration. */
export interface ResolvedMcpStdioServer {
  readonly transport: "stdio";
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

/** MCP transport configuration after environment references are resolved. */
export type ResolvedMcpServer = ResolvedMcpHttpServer | ResolvedMcpStdioServer;

/** Origin metadata attached to MCP tool stream events. */
export interface McpToolOrigin {
  /** MCP server identifier. */
  readonly serverId: string;
  /** Original tool name advertised by the server. */
  readonly toolName: string;
}

/** AI SDK tools exposed by one connected MCP server. */
export interface McpServerToolSet {
  /** Namespaced model-facing tools keyed by namespaced name. */
  readonly tools: Readonly<ToolSet>;
  /** Origin lookup keyed by namespaced model-facing tool name. */
  readonly origins: Readonly<Record<string, McpToolOrigin>>;
}

/** Connection outcome safe to expose over the daemon protocol. */
export interface McpServerStatus {
  readonly id: string;
  readonly source: McpServerSource;
  readonly transport: McpServerDefinition["transport"];
  readonly enabled: boolean;
  readonly connected: boolean;
  readonly toolCount: number;
  readonly error?: string;
}

/** Runtime MCP tools prepared for one LLM agent. */
export interface McpAgentToolSet {
  readonly tools: Readonly<ToolSet>;
  readonly origins: Readonly<Record<string, McpToolOrigin>>;
}

/** Options for connecting a selected set of MCP servers. */
export interface CreateMcpConnectionManagerOptions {
  /** Effective server registry, including strategy-private entries. */
  readonly servers: ReadonlyMap<string, McpServerEntry>;
  /** Server IDs enabled for this execution. */
  readonly enabledServerIds: readonly string[];
  /** Environment used to resolve secret references. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Run-scoped collection of connected MCP clients and their tools. */
export interface McpConnectionManager {
  /** Safe connection outcomes for status display and persistence. */
  readonly statuses: readonly McpServerStatus[];
  /** Build the merged MCP tool set for the requested server IDs. */
  toolsFor(serverIds: readonly string[]): McpAgentToolSet;
  /** Close all successfully connected clients. Idempotent. */
  close(): Promise<void>;
}
