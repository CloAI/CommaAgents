import { join } from "node:path";

import { resolveDataDir } from "../data-directory";
import { CREDENTIALS_FILENAME } from "./credentials.constants";

/**
 * Resolve the default path to the credentials JSON file.
 *
 * Convenience wrapper: `join(resolveDataDir(), "credentials.json")`.
 *
 * @example
 * ```ts
 * const backend = createJsonFileBackend({ filePath: resolveCredentialsPath() });
 * ```
 */
export function resolveCredentialsPath(): string {
  return join(resolveDataDir(), CREDENTIALS_FILENAME);
}
