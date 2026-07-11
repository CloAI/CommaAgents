import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the shared CommaAgents directory in the current user's home directory.
 *
 * @example
 * ```ts
 * const dataDirectory = resolveApplicationDataDirectory();
 * // Unix:   "/home/alice/.comma"
 * // Windows: "C:\\Users\\Alice\\.comma"
 * ```
 */
export function resolveApplicationDataDirectory(): string {
  return join(homedir(), ".comma");
}
