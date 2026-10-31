import { join } from "node:path";

import {
  DEFAULT_AUDIT_DIRECTORY_NAME,
  DEFAULT_CACHE_DIRECTORY_NAME,
  DEFAULT_GLOBAL_SKILLS_DIRECTORY_NAME,
  DEFAULT_HUB_DIRECTORY_NAME,
  DEFAULT_PACKAGES_DIRECTORY_NAME,
  DEFAULT_PROVIDERS_DIRECTORY_NAME,
  DEFAULT_STRATEGIES_DIRECTORY_NAME,
  DEFAULT_TRASH_DIRECTORY_NAME,
  PROCESS_ENV_COMMA_AGENTS_CATALOG_CACHE_FILENAME,
  PROCESS_ENV_COMMA_AGENTS_CREDENTIALS_FILENAME,
  PROCESS_ENV_COMMA_AGENTS_DATA_DIRECTORY,
  PROCESS_ENV_COMMA_AGENTS_MCP_CONFIG_FILENAME,
  PROCESS_ENV_COMMA_AGENTS_PROJECT_DIRECTORY_NAME,
} from "./defaults.constants";
import type { CoreDefaultOverrides } from "./defaults.types";

let coreDefaultOverrides: CoreDefaultOverrides = {};

// Application

/** Return the effective Core application data directory. */
export function getApplicationDataDirectory(): string {
  return (
    coreDefaultOverrides.applicationDataDirectory ??
    PROCESS_ENV_COMMA_AGENTS_DATA_DIRECTORY
  );
}

/** Override the Core application data directory for this process. */
export function setApplicationDataDirectory(
  directory: string | undefined,
): void {
  coreDefaultOverrides = {
    ...coreDefaultOverrides,
    applicationDataDirectory: directory,
  };
}

// Credentials

/** Return the effective credentials file path. */
export function getCredentialsPath(): string {
  return (
    coreDefaultOverrides.credentialsPath ??
    join(
      getApplicationDataDirectory(),
      PROCESS_ENV_COMMA_AGENTS_CREDENTIALS_FILENAME,
    )
  );
}

/** Override the credentials file path for this process. */
export function setCredentialsPath(path: string | undefined): void {
  coreDefaultOverrides = { ...coreDefaultOverrides, credentialsPath: path };
}

// Provider

/** Return the file containing declarative custom providers and model IDs.
 * @returns {string} Effective provider settings file path.
 */
export function getProviderSettingsPath(): string {
  return (
    coreDefaultOverrides.providerSettingsPath ??
    join(getApplicationDataDirectory(), "provider-settings.json")
  );
}

/** Override the provider settings path for this process.
 * @param {string | undefined} path - Override, or undefined to restore the default.
 * @returns {void} Nothing.
 */
export function setProviderSettingsPath(path: string | undefined): void {
  coreDefaultOverrides = {
    ...coreDefaultOverrides,
    providerSettingsPath: path,
  };
}

/** Return the effective provider package installation directory. */
export function getProviderInstallDirectory(): string {
  return (
    coreDefaultOverrides.providerInstallDirectory ??
    join(getApplicationDataDirectory(), DEFAULT_PROVIDERS_DIRECTORY_NAME)
  );
}

/** Override the provider package installation directory for this process. */
export function setProviderInstallDirectory(
  directory: string | undefined,
): void {
  coreDefaultOverrides = {
    ...coreDefaultOverrides,
    providerInstallDirectory: directory,
  };
}

// Catalog

/** Return the effective model catalog cache path. */
export function getCatalogCachePath(): string {
  return (
    coreDefaultOverrides.catalogCachePath ??
    join(
      getApplicationDataDirectory(),
      DEFAULT_CACHE_DIRECTORY_NAME,
      PROCESS_ENV_COMMA_AGENTS_CATALOG_CACHE_FILENAME,
    )
  );
}

/** Override the model catalog cache path for this process. */
export function setCatalogCachePath(path: string | undefined): void {
  coreDefaultOverrides = { ...coreDefaultOverrides, catalogCachePath: path };
}

// Skills

/** Return the effective global skills directory. */
export function getGlobalSkillsDirectory(): string {
  return (
    coreDefaultOverrides.globalSkillsDirectory ??
    join(getApplicationDataDirectory(), DEFAULT_GLOBAL_SKILLS_DIRECTORY_NAME)
  );
}

/** Override the global skills directory for this process. */
export function setGlobalSkillsDirectory(directory: string | undefined): void {
  coreDefaultOverrides = {
    ...coreDefaultOverrides,
    globalSkillsDirectory: directory,
  };
}

export function getProjectSkillsDirectory(workspaceRoot: string): string {
  return join(
    getProjectDirectory(workspaceRoot),
    DEFAULT_GLOBAL_SKILLS_DIRECTORY_NAME,
  );
}

// MCP

export function getGlobalMcpConfigPath(
  dataDirectory = getApplicationDataDirectory(),
): string {
  return join(dataDirectory, PROCESS_ENV_COMMA_AGENTS_MCP_CONFIG_FILENAME);
}

export function getProjectMcpConfigPath(workspaceRoot: string): string {
  return join(
    getProjectDirectory(workspaceRoot),
    PROCESS_ENV_COMMA_AGENTS_MCP_CONFIG_FILENAME,
  );
}

// Audit

export function getProjectAuditDirectory(workspaceRoot: string): string {
  return join(getProjectDirectory(workspaceRoot), DEFAULT_AUDIT_DIRECTORY_NAME);
}

// Strategies

export function getStrategiesDirectory(
  dataDirectory = getApplicationDataDirectory(),
): string {
  return join(dataDirectory, DEFAULT_STRATEGIES_DIRECTORY_NAME);
}

export function getProjectStrategiesDirectory(workspaceRoot: string): string {
  return join(
    getProjectDirectory(workspaceRoot),
    DEFAULT_STRATEGIES_DIRECTORY_NAME,
  );
}

export function getPackagesDirectory(
  dataDirectory = getApplicationDataDirectory(),
): string {
  return join(dataDirectory, DEFAULT_PACKAGES_DIRECTORY_NAME);
}

export function getHubDirectory(
  dataDirectory = getApplicationDataDirectory(),
): string {
  return join(dataDirectory, DEFAULT_HUB_DIRECTORY_NAME);
}

export function getTrashDirectory(): string {
  return join(getApplicationDataDirectory(), DEFAULT_TRASH_DIRECTORY_NAME);
}

/** Return the project metadata directory for a workspace. */
export function getProjectDirectory(workspaceRoot: string): string {
  return join(workspaceRoot, PROCESS_ENV_COMMA_AGENTS_PROJECT_DIRECTORY_NAME);
}

/** Clear all runtime location overrides. Intended for tests and process reset. */
export function resetCoreLocationOverrides(): void {
  coreDefaultOverrides = {};
}
