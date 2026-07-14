import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_APPLICATION_DATA_DIRECTORY_NAME = ".comma";
export const DEFAULT_PROJECT_DIRECTORY_NAME = ".comma";
export const DEFAULT_CREDENTIALS_FILENAME = "credentials.json";
export const DEFAULT_MCP_CONFIG_FILENAME = "mcp.json";
export const DEFAULT_CATALOG_CACHE_FILENAME = "models-catalog.json";
export const DEFAULT_GLOBAL_SKILLS_DIRECTORY_NAME = "skills";
export const DEFAULT_PROVIDERS_DIRECTORY_NAME = "providers";
export const DEFAULT_CACHE_DIRECTORY_NAME = "cache";
export const DEFAULT_AUDIT_DIRECTORY_NAME = "audit";
export const DEFAULT_STRATEGIES_DIRECTORY_NAME = "strategies";
export const DEFAULT_PACKAGES_DIRECTORY_NAME = "packages";
export const DEFAULT_HUB_DIRECTORY_NAME = "hub";
export const DEFAULT_TRASH_DIRECTORY_NAME = "trash";

/** Initial application data directory. Override with `COMMA_AGENTS_DATA_DIRECTORY`. */
export const PROCESS_ENV_COMMA_AGENTS_DATA_DIRECTORY =
  process.env.COMMA_AGENTS_DATA_DIRECTORY ||
  join(homedir(), DEFAULT_APPLICATION_DATA_DIRECTORY_NAME);

/** Initial project metadata directory name. Override with `COMMA_AGENTS_PROJECT_DIRECTORY_NAME`. */
export const PROCESS_ENV_COMMA_AGENTS_PROJECT_DIRECTORY_NAME =
  process.env.COMMA_AGENTS_PROJECT_DIRECTORY_NAME ||
  DEFAULT_PROJECT_DIRECTORY_NAME;

/** Initial credentials filename. Override with `COMMA_AGENTS_CREDENTIALS_FILENAME`. */
export const PROCESS_ENV_COMMA_AGENTS_CREDENTIALS_FILENAME =
  process.env.COMMA_AGENTS_CREDENTIALS_FILENAME || DEFAULT_CREDENTIALS_FILENAME;

/** Initial MCP configuration filename. Override with `COMMA_AGENTS_MCP_CONFIG_FILENAME`. */
export const PROCESS_ENV_COMMA_AGENTS_MCP_CONFIG_FILENAME =
  process.env.COMMA_AGENTS_MCP_CONFIG_FILENAME || DEFAULT_MCP_CONFIG_FILENAME;

/** Initial model catalog cache filename. Override with `COMMA_AGENTS_CATALOG_CACHE_FILENAME`. */
export const PROCESS_ENV_COMMA_AGENTS_CATALOG_CACHE_FILENAME =
  process.env.COMMA_AGENTS_CATALOG_CACHE_FILENAME ||
  DEFAULT_CATALOG_CACHE_FILENAME;
