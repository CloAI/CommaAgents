import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  findCommaProjectRoot,
  getApplicationDataDirectory,
  getGlobalMcpConfigPath,
  getProjectMcpConfigPath,
} from "../defaults/defaults";
import { McpConfigFileSchema } from "./mcp.schema";
import type {
  DiscoverMcpConfigOptions,
  UpdateMcpServerDefaultOptions,
  McpConfigDiscovery,
  McpServerEntry,
  McpValue,
  ResolvedMcpServer,
} from "./mcp.types";

/** Discover and merge global and workspace MCP server definitions.
 * @param {DiscoverMcpConfigOptions} options - Working directory and global data location.
 * @returns {McpConfigDiscovery} Effective definitions with their source files.
 */
export function discoverMcpConfig({
  cwd = process.cwd(),
  dataDir = getApplicationDataDirectory(),
}: DiscoverMcpConfigOptions = {}): McpConfigDiscovery {
  const globalConfigPath = getGlobalMcpConfigPath(dataDir);
  const projectRoot = findCommaProjectRoot(cwd);
  const workspaceConfigPath = getProjectMcpConfigPath(projectRoot ?? cwd);
  const servers = new Map<string, McpServerEntry>();

  loadMcpConfigFile(globalConfigPath, "global", servers);
  if (projectRoot) {
    loadMcpConfigFile(workspaceConfigPath, "workspace", servers);
  }

  return { servers, globalConfigPath, workspaceConfigPath };
}

/** Resolve environment references without mutating or serializing secret values.
 * @param {McpServerEntry} entry - Discovered transport definition.
 * @param {Readonly<Record<string, string | undefined>>} env - Environment values for explicit references.
 * @returns {ResolvedMcpServer} Transport settings ready for connection.
 */
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

/** Resolve one literal/environment-backed MCP configuration value.
 * @param {McpValue} value - Literal string or environment reference.
 * @param {Readonly<Record<string, string | undefined>>} env - Environment available to the connection.
 * @returns {string} Resolved value.
 */
export function resolveMcpValue(
  value: McpValue,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (typeof value === "string") {
    return value;
  }
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
  if (!existsSync(configPath)) {
    return;
  }
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

/** Update the winning global/project definition without resolving environment references.
 * @param {UpdateMcpServerDefaultOptions} options - Discovery location and default selection.
 * @returns {void} Nothing after the validated configuration is atomically replaced.
 */
export function updateMcpServerDefault({
  serverId,
  enabled,
  ...location
}: UpdateMcpServerDefaultOptions): void {
  if (typeof enabled !== "boolean" || !serverId) {
    throw new Error("Invalid MCP default update");
  }
  const entry = discoverMcpConfig(location).servers.get(serverId);
  if (!entry?.configPath) {
    throw new Error(`Unknown shared MCP server: ${serverId}`);
  }
  const config = McpConfigFileSchema.parse(
    JSON.parse(readFileSync(entry.configPath, "utf8")),
  );
  config.mcpServers[serverId]!.enabledByDefault = enabled;
  const temporaryPath = `${entry.configPath}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporaryPath, entry.configPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}
