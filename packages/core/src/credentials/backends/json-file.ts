// JsonFileBackend — reads/writes credentials to a plain JSON file.
//
// The file is stored at `<dataDir>/credentials.json` with 0o600 permissions
// (owner read/write only). Parent directories are created if needed.
//
// TODO: EncryptedFileBackend — encrypt the JSON payload with a user-provided
//       passphrase or derived key before writing to disk.
// TODO: KeychainBackend — use the OS keychain (macOS Keychain, GNOME Keyring,
//       Windows Credential Locker) via a native binding or CLI.

import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CredentialSchema } from "../credentials.schema";
import type {
  CredentialBackend,
  CredentialStoreData,
} from "../credentials.types";

// Validation schema for the persisted file

/**
 * Schema for the credentials file.
 * Each top-level key is a scope ("$global" or a strategy name),
 * and each value is a map of provider ID → Credential.
 */
const CredentialFileSchema = z.record(z.record(CredentialSchema));

// JsonFileBackend

export interface JsonFileBackendOptions {
  /** Absolute path to the credentials JSON file. */
  readonly filePath: string;
}

/**
 * Creates a JSON file-backed credential storage backend.
 *
 * - Creates parent directories on first write.
 * - Sets file permissions to 0o600 (owner read/write only).
 * - Returns empty data when the file doesn't exist.
 * - Rejects unreadable, empty, malformed, or invalid files with a safe storage error.
 *   Callers must repair the file before attempting credential mutations.
 *
 * @param {JsonFileBackendOptions} options - Credential file location.
 * @returns {CredentialBackend} A JSON backend that rejects invalid storage without exposing secrets.
 * @example
 * ```ts
 * const backend = createJsonFileCredentialBackend({ filePath: "/home/user/.comma/credentials.json" });
 * const data = await backend.readAll();
 * ```
 */
export function createJsonFileCredentialBackend(
  options: JsonFileBackendOptions,
): CredentialBackend {
  const { filePath } = options;

  return {
    async readAll(): Promise<CredentialStoreData> {
      let raw: string;
      try {
        raw = readFileSync(filePath, "utf-8");
      } catch (readError) {
        if (
          readError instanceof Error &&
          "code" in readError &&
          readError.code === "ENOENT"
        ) {
          return {};
        }
        throw Object.assign(new Error("Unable to read credential storage."), {
          code: "CREDENTIAL_STORAGE_ERROR",
        });
      }

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw Object.assign(
          new Error("Credential storage contains invalid data."),
          {
            code: "CREDENTIAL_STORAGE_ERROR",
          },
        );
      }

      const result = CredentialFileSchema.safeParse(json);
      if (!result.success) {
        throw Object.assign(
          new Error("Credential storage contains invalid data."),
          {
            code: "CREDENTIAL_STORAGE_ERROR",
          },
        );
      }

      return result.data;
    },

    async writeAll(data: CredentialStoreData): Promise<void> {
      try {
        // Never forward validation or filesystem errors containing secret values or paths.
        CredentialFileSchema.parse(data);
        mkdirSync(dirname(filePath), { recursive: true });
        const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
        try {
          writeFileSync(temporaryPath, JSON.stringify(data, null, 2), {
            encoding: "utf-8",
            mode: 0o600,
            flag: "wx",
          });
          chmodSync(temporaryPath, 0o600);
          renameSync(temporaryPath, filePath);
        } finally {
          rmSync(temporaryPath, { force: true });
        }
      } catch {
        throw Object.assign(new Error("Unable to write credential storage."), {
          code: "CREDENTIAL_STORAGE_ERROR",
        });
      }
    },
  };
}
