// Tests for credential store (auth.ts)

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCredentialReader,
  getCredential,
  getDataDir,
  listCredentials,
  readCredentialStore,
  removeCredential,
  setCredential,
  writeCredentialStore,
} from "./auth";

// Helpers

/** Create a temporary directory for test credential stores. */
async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "comma-agents-test-"));
}

/** Clean up temporary directory. */
async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// Tests

describe("getDataDir", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.COMMA_AGENTS_DATA_DIR = process.env.COMMA_AGENTS_DATA_DIR;
    delete process.env.COMMA_AGENTS_DATA_DIR;
  });

  afterEach(() => {
    if (originalEnv.COMMA_AGENTS_DATA_DIR !== undefined) {
      process.env.COMMA_AGENTS_DATA_DIR = originalEnv.COMMA_AGENTS_DATA_DIR;
    } else {
      delete process.env.COMMA_AGENTS_DATA_DIR;
    }
  });

  it("should return override when COMMA_AGENTS_DATA_DIR is set", () => {
    process.env.COMMA_AGENTS_DATA_DIR = "/custom/path";
    expect(getDataDir()).toBe("/custom/path");
  });

  it("should return a platform-appropriate path by default", () => {
    const dir = getDataDir();
    expect(dir).toContain("comma-agents");
    expect(dir.length).toBeGreaterThan(0);
  });
});

describe("readCredentialStore", () => {
  it("should return empty object for nonexistent file", async () => {
    const store = await readCredentialStore("/nonexistent/path/auth.json");
    expect(store).toEqual({});
  });

  it("should read a valid credential store file", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        storePath,
        JSON.stringify({
          openai: { key: "sk-test-123" },
          anthropic: { key: "sk-ant-456" },
        }),
      );

      const store = await readCredentialStore(storePath);
      expect(store.openai?.key).toBe("sk-test-123");
      expect(store.anthropic?.key).toBe("sk-ant-456");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should return empty object for invalid JSON", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(storePath, "not valid json {{{");

      const store = await readCredentialStore(storePath);
      expect(store).toEqual({});
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should return empty object for JSON array", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(storePath, "[]");

      const store = await readCredentialStore(storePath);
      expect(store).toEqual({});
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});

describe("writeCredentialStore", () => {
  it("should create the file with correct content", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await writeCredentialStore({ openai: { key: "sk-test" } }, storePath);

      const content = await readFile(storePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.openai.key).toBe("sk-test");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should create nested directories if needed", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "nested", "deep", "auth.json");

    try {
      await writeCredentialStore({ test: { key: "val" } }, storePath);

      const content = await readFile(storePath, "utf-8");
      expect(JSON.parse(content).test.key).toBe("val");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should set file permissions to 0o600", async () => {
    // Skip on Windows where chmod is limited
    if (process.platform === "win32") return;

    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await writeCredentialStore({ test: { key: "val" } }, storePath);

      const stats = await stat(storePath);
      // Check the permission bits (mask out file type bits)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});

describe("getCredential", () => {
  it("should return the key for an existing provider", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await writeCredentialStore({ openai: { key: "sk-get-test" } }, storePath);

      const key = await getCredential("openai", storePath);
      expect(key).toBe("sk-get-test");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should return undefined for a missing provider", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await writeCredentialStore({}, storePath);

      const key = await getCredential("openai", storePath);
      expect(key).toBeUndefined();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should return undefined for nonexistent store", async () => {
    const key = await getCredential("openai", "/nonexistent/auth.json");
    expect(key).toBeUndefined();
  });
});

describe("setCredential", () => {
  it("should add a new credential", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await setCredential("openai", "sk-new-key", storePath);

      const key = await getCredential("openai", storePath);
      expect(key).toBe("sk-new-key");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should update an existing credential", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await setCredential("openai", "sk-old", storePath);
      await setCredential("openai", "sk-new", storePath);

      const key = await getCredential("openai", storePath);
      expect(key).toBe("sk-new");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should preserve other credentials when adding", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await setCredential("openai", "sk-openai", storePath);
      await setCredential("anthropic", "sk-ant", storePath);

      const openaiKey = await getCredential("openai", storePath);
      const anthropicKey = await getCredential("anthropic", storePath);

      expect(openaiKey).toBe("sk-openai");
      expect(anthropicKey).toBe("sk-ant");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});

describe("removeCredential", () => {
  it("should remove an existing credential", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await setCredential("openai", "sk-to-remove", storePath);
      await removeCredential("openai", storePath);

      const key = await getCredential("openai", storePath);
      expect(key).toBeUndefined();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should not affect other credentials", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await setCredential("openai", "sk-openai", storePath);
      await setCredential("anthropic", "sk-ant", storePath);
      await removeCredential("openai", storePath);

      const openaiKey = await getCredential("openai", storePath);
      const anthropicKey = await getCredential("anthropic", storePath);

      expect(openaiKey).toBeUndefined();
      expect(anthropicKey).toBe("sk-ant");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should be a no-op for missing credentials", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await writeCredentialStore({}, storePath);
      // Should not throw
      await removeCredential("openai", storePath);

      const store = await readCredentialStore(storePath);
      expect(store).toEqual({});
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});

describe("listCredentials", () => {
  it("should list all provider IDs with stored credentials", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await setCredential("openai", "sk-1", storePath);
      await setCredential("anthropic", "sk-2", storePath);
      await setCredential("groq", "sk-3", storePath);

      const list = await listCredentials(storePath);
      expect(list).toContain("openai");
      expect(list).toContain("anthropic");
      expect(list).toContain("groq");
      expect(list).toHaveLength(3);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should return empty array for empty store", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await writeCredentialStore({}, storePath);

      const list = await listCredentials(storePath);
      expect(list).toEqual([]);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});

describe("createCredentialReader", () => {
  it("should return a function compatible with resolveKey", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await setCredential("openai", "sk-reader-test", storePath);

      const reader = createCredentialReader(storePath);
      const key = await reader("openai");
      expect(key).toBe("sk-reader-test");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should return undefined for missing providers", async () => {
    const tempDir = await createTempDir();
    const storePath = join(tempDir, "auth.json");

    try {
      await writeCredentialStore({}, storePath);

      const reader = createCredentialReader(storePath);
      const key = await reader("missing");
      expect(key).toBeUndefined();
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
