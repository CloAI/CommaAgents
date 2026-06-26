import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { resolveDataDir } from "../data-directory";
import { McpConfigFileSchema } from "./mcp.schema";
import type {
  DiscoverMcpConfigOptions,
  McpConfigDiscovery,
  McpServerEntry,
  McpValue,
  ResolvedMcpServer,
} from "./mcp.types";

const MCP_CONFIG_FILENAME = "mcp.json";

/** Discover and merge global and workspace MCP server definitions. */
export function discoverMcpConfig({
  cwd = process.cwd(),
  dataDir = resolveDataDir(),
}: DiscoverMcpConfigOptions = {}): McpConfigDiscovery {
  const globalConfigPath = join(dataDir, MCP_CONFIG_FILENAME);
  const workspaceConfigPath = join(cwd, ".comma", MCP_CONFIG_FILENAME);
  const servers = new Map<string, McpServerEntry>();

  loadMcpConfigFile(globalConfigPath, "global", servers);
  loadMcpConfigFile(workspaceConfigPath, "workspace", servers);

  return { servers, globalConfigPath, workspaceConfigPath };
}

/** Resolve environment references without mutating or serializing secret values. */
export function resolveMcpServer(
  entry: McpServerEntry,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResolvedMcpServer {
  const { definition } = entry;
  if (definition.transport === "stdio") {
    const cwdValue =
      definition.cwd === undefined
        ? undefined
        : resolveMcpValue(definition.cwd, env);
    return {
      transport: "stdio",
      command: resolveMcpValue(definition.command, env),
      ...(definition.args
        ? { args: definition.args.map((value) => resolveMcpValue(value, env)) }
        : {}),
      ...(cwdValue
        ? {
            cwd: isAbsolute(cwdValue)
              ? cwdValue
              : resolve(entry.baseDir, cwdValue),
          }
        : {}),
      ...(definition.env
        ? { env: resolveMcpValueRecord(definition.env, env) }
        : {}),
    };
  }

  return {
    transport: definition.transport,
    url: resolveMcpValue(definition.url, env),
    ...(definition.headers
      ? { headers: resolveMcpValueRecord(definition.headers, env) }
      : {}),
  };
}

/** Resolve one literal/environment-backed MCP configuration value. */
export function resolveMcpValue(
  value: McpValue,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (typeof value === "string") return value;
  const resolvedValue = env[value.env];
  if (resolvedValue === undefined || resolvedValue.length === 0) {
    throw new Error(`Missing environment variable: ${value.env}`);
  }
  return resolvedValue;
}

function loadMcpConfigFile(
  configPath: string,
  source: "global" | "workspace",
  servers: Map<string, McpServerEntry>,
): void {
  if (!existsSync(configPath)) return;
  const parsed = McpConfigFileSchema.parse(
    JSON.parse(readFileSync(configPath, "utf8")),
  );
  for (const [id, definition] of Object.entries(parsed.mcpServers)) {
    servers.set(id, {
      id,
      definition,
      source,
      configPath,
      baseDir: dirname(configPath),
    });
  }
}

function resolveMcpValueRecord(
  values: Readonly<Record<string, McpValue>>,
  env: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      resolveMcpValue(value, env),
    ]),
  );
}
