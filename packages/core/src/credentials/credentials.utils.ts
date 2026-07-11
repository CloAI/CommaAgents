import { join } from "node:path";

import { resolveApplicationDataDirectory } from "../data-directory";
import { CREDENTIALS_FILENAME } from "./credentials.constants";

/**
 * Resolve the default path to the credentials JSON file.
 *
 * Convenience wrapper: `join(resolveApplicationDataDirectory(), "credentials.json")`.
 *
 * @example
 * ```ts
 * const backend = createJsonFileCredentialBackend({ filePath: resolveCredentialsPath() });
 * ```
 */
export function resolveCredentialsPath(): string {
  return join(resolveApplicationDataDirectory(), CREDENTIALS_FILENAME);
}
