// JsonFileBackend — reads/writes credentials to a plain JSON file.
//
// The file is stored at `<dataDir>/credentials.json` with 0o600 permissions
// (owner read/write only). Parent directories are created if needed.
//
// TODO: EncryptedFileBackend — encrypt the JSON payload with a user-provided
//       passphrase or derived key before writing to disk.
// TODO: KeychainBackend — use the OS keychain (macOS Keychain, GNOME Keyring,
//       Windows Credential Locker) via a native binding or CLI.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { CredentialSchema } from "../../protocol/shared";
import type { CredentialBackend, CredentialStoreData } from "../types";

// ---------------------------------------------------------------------------
// Validation schema for the persisted file
// ---------------------------------------------------------------------------

/**
 * Schema for the credentials file.
 * Each top-level key is a scope ("$global" or a strategy name),
 * and each value is a map of provider ID → Credential.
 */
const CredentialFileSchema = z.record(z.record(CredentialSchema));

// ---------------------------------------------------------------------------
// JsonFileBackend
// ---------------------------------------------------------------------------

export interface JsonFileBackendOptions {
  /** Absolute path to the credentials JSON file. */
  filePath: string;
}

/**
 * Creates a JSON file-backed credential storage backend.
 *
 * - Creates parent directories on first write.
 * - Sets file permissions to 0o600 (owner read/write only).
 * - Returns empty data when the file doesn't exist.
 * - Returns empty data when the file contains invalid JSON or fails
 *   schema validation (logs a warning but doesn't throw).
 */
export function createJsonFileBackend(options: JsonFileBackendOptions): CredentialBackend {
  const { filePath } = options;

  return {
    async readAll(): Promise<CredentialStoreData> {
      if (!existsSync(filePath)) {
        return {};
      }

      let raw: string;
      try {
        raw = readFileSync(filePath, "utf-8");
      } catch {
        // File exists but can't be read (permissions, race condition, etc.)
        return {};
      }

      // Empty file → empty data
      if (raw.trim() === "") {
        return {};
      }

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        // Corrupt JSON — return empty rather than crash.
        // The next writeAll() will overwrite with valid data.
        return {};
      }

      const result = CredentialFileSchema.safeParse(json);
      if (!result.success) {
        // Schema mismatch — return empty. Data will be overwritten on next set().
        return {};
      }

      return result.data;
    },

    async writeAll(data: CredentialStoreData): Promise<void> {
      // Validate before writing (defense in depth).
      CredentialFileSchema.parse(data);

      // Ensure parent directory exists.
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const json = JSON.stringify(data, null, 2);
      writeFileSync(filePath, json, { encoding: "utf-8", mode: 0o600 });
    },
  };
}
