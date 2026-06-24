import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the shared CommaAgents directory in the current user's home directory.
 *
 * @example
 * ```ts
 * const dataDirectory = resolveDataDir();
 * // Unix:   "/home/alice/.comma"
 * // Windows: "C:\\Users\\Alice\\.comma"
 * ```
 */
export function resolveDataDir(): string {
  return join(homedir(), ".comma");
}
