import type { CliInstallation } from "../installation";

/** Data categories that can be removed alongside the CLI. */
export interface UninstallSelections {
  /** Remove persisted daemon runs and conversation history. */
  readonly removeHistory: boolean;
  /** Remove Hub packages, provider packages, and their registries. */
  readonly removePackages: boolean;
  /** Remove remaining CommaAgents configuration, credentials, logs, and trash. */
  readonly removeConfig: boolean;
}

/** Options for interactive or automated CLI removal. */
export interface RunUninstallerOptions {
  /** Skip the initial uninstall confirmation. @default false */
  readonly confirmed?: boolean;
  /** Remove persisted conversation history. */
  readonly removeHistory?: boolean;
  /** Remove installed Hub and provider packages. */
  readonly removePackages?: boolean;
  /** Remove remaining configuration, credentials, logs, and trash. */
  readonly removeConfig?: boolean;
}

/** Outcome of an uninstall attempt. */
export interface UninstallResult {
  /** Whether removal of the CLI executable or global package was scheduled. */
  readonly uninstalled: boolean;
  /** Data-removal choices, or `undefined` when the user cancelled. */
  readonly selections: UninstallSelections | undefined;
  /** Non-fatal cleanup failures that may require manual attention. */
  readonly warnings: readonly string[];
  /** Detected installation method, or `undefined` when the user cancelled. */
  readonly installation: CliInstallation | undefined;
}
