// Tests for daemon configuration.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDir } from "@comma-agents/core";
import { DaemonConfigFileSchema } from ".";
import { loadDaemonConfig } from "./config";

// Helpers

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `comma-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJsonConfig(dir: string, config: Record<string, unknown>): string {
  const filePath = join(dir, "daemon.json");
  writeFileSync(filePath, JSON.stringify(config));
  return filePath;
}

/** Clean env — no COMMA_DAEMON_* variables. */
function cleanEnv(): Record<string, string | undefined> {
  return {};
}

// resolveDataDir

describe("resolveDataDir", () => {
  test("returns a path containing comma-agents", () => {
    const dir = resolveDataDir();
    expect(dir).toContain("comma-agents");
  });

  test("returns path under home directory", () => {
    const dir = resolveDataDir();
    const home = homedir();
    expect(dir.startsWith(home)).toBe(true);
  });

  test("on macOS returns Library/Application Support path", () => {
    if (process.platform !== "darwin") return;
    const dir = resolveDataDir();
    expect(dir).toContain("Library/Application Support/comma-agents");
  });
});

// DaemonConfigFileSchema

describe("DaemonConfigFileSchema", () => {
  test("accepts empty object (all optional)", () => {
    expect(DaemonConfigFileSchema.parse({})).toEqual({});
  });

  test("accepts valid full config", () => {
    const config = {
      port: 8080,
      host: "0.0.0.0",
      logLevel: "debug",
      logFile: "/var/log/daemon.log",
      providerCacheDir: "/tmp/providers",
      pidFile: "/tmp/daemon.pid",
    } as const;
    expect(DaemonConfigFileSchema.parse(config)).toMatchObject(config);
  });

  test("rejects port out of range", () => {
    expect(DaemonConfigFileSchema.safeParse({ port: 0 }).success).toBe(false);
    expect(DaemonConfigFileSchema.safeParse({ port: 70000 }).success).toBe(
      false,
    );
    expect(DaemonConfigFileSchema.safeParse({ port: -1 }).success).toBe(false);
  });

  test("rejects non-integer port", () => {
    expect(DaemonConfigFileSchema.safeParse({ port: 3.14 }).success).toBe(
      false,
    );
  });

  test("rejects invalid logLevel", () => {
    expect(
      DaemonConfigFileSchema.safeParse({ logLevel: "verbose" }).success,
    ).toBe(false);
  });

  test("rejects unknown fields (strict mode)", () => {
    expect(DaemonConfigFileSchema.safeParse({ unknown: true }).success).toBe(
      false,
    );
  });

  test("accepts all valid log levels", () => {
    const levels = ["debug", "info", "warn", "error"] as const;
    for (const level of levels) {
      const parsed = DaemonConfigFileSchema.parse({ logLevel: level });
      expect(parsed.logLevel).toBe(level);
    }
  });
});

// loadDaemonConfig — defaults

describe("loadDaemonConfig defaults", () => {
  test("returns defaults when no config file and no env vars", () => {
    const tempDir = createTempDir();
    try {
      const configFile = join(tempDir, "nonexistent.json");
      const config = loadDaemonConfig({ configFile, env: cleanEnv() });

      expect(config.port).toBe(7422);
      expect(config.host).toBe("127.0.0.1");
      expect(config.logLevel).toBe("info");
      expect(config.logFile).toContain("daemon.log");
      expect(config.providerCacheDir).toContain("providers");
      expect(config.pidFile).toContain("daemon.pid");
      expect(config.configFile).toBe(configFile);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("default providerCacheDir is under data dir", () => {
    const tempDir = createTempDir();
    try {
      const config = loadDaemonConfig({
        configFile: join(tempDir, "none.json"),
        env: cleanEnv(),
      });
      expect(config.providerCacheDir).toContain("comma-agents");
      expect(config.providerCacheDir.endsWith("providers")).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("default pidFile is under data dir", () => {
    const tempDir = createTempDir();
    try {
      const config = loadDaemonConfig({
        configFile: join(tempDir, "none.json"),
        env: cleanEnv(),
      });
      expect(config.pidFile).toContain("comma-agents");
      expect(config.pidFile.endsWith("daemon.pid")).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// loadDaemonConfig — JSON config file overrides

describe("loadDaemonConfig JSON file overrides", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("overrides port from config file", () => {
    const configFile = writeJsonConfig(tempDir, { port: 9000 });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.port).toBe(9000);
  });

  test("overrides host from config file", () => {
    const configFile = writeJsonConfig(tempDir, { host: "0.0.0.0" });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.host).toBe("0.0.0.0");
  });

  test("overrides logLevel from config file", () => {
    const configFile = writeJsonConfig(tempDir, { logLevel: "debug" });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.logLevel).toBe("debug");
  });

  test("overrides logFile from config file", () => {
    const configFile = writeJsonConfig(tempDir, {
      logFile: "/var/log/comma.log",
    });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.logFile).toBe("/var/log/comma.log");
  });

  test("overrides providerCacheDir from config file", () => {
    const configFile = writeJsonConfig(tempDir, {
      providerCacheDir: "/custom/providers",
    });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.providerCacheDir).toBe("/custom/providers");
  });

  test("overrides pidFile from config file", () => {
    const configFile = writeJsonConfig(tempDir, {
      pidFile: "/custom/daemon.pid",
    });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.pidFile).toBe("/custom/daemon.pid");
  });

  test("partial overrides keep defaults for other fields", () => {
    const configFile = writeJsonConfig(tempDir, { port: 8080 });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.port).toBe(8080);
    expect(config.host).toBe("127.0.0.1"); // default
    expect(config.logLevel).toBe("info"); // default
  });

  test("throws on invalid JSON in config file", () => {
    const filePath = join(tempDir, "daemon.json");
    writeFileSync(filePath, "not json {{{");
    expect(() =>
      loadDaemonConfig({ configFile: filePath, env: cleanEnv() }),
    ).toThrow();
  });

  test("throws on schema-invalid config file", () => {
    const configFile = writeJsonConfig(tempDir, { port: "not a number" });
    expect(() => loadDaemonConfig({ configFile, env: cleanEnv() })).toThrow();
  });

  test("throws on unknown fields in config file", () => {
    const configFile = writeJsonConfig(tempDir, { unknownField: true });
    expect(() => loadDaemonConfig({ configFile, env: cleanEnv() })).toThrow();
  });
});

// loadDaemonConfig — env var overrides

describe("loadDaemonConfig env var overrides", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("COMMA_DAEMON_PORT overrides default", () => {
    const config = loadDaemonConfig({
      configFile: join(tempDir, "none.json"),
      env: { COMMA_DAEMON_PORT: "9999" },
    });
    expect(config.port).toBe(9999);
  });

  test("COMMA_DAEMON_HOST overrides default", () => {
    const config = loadDaemonConfig({
      configFile: join(tempDir, "none.json"),
      env: { COMMA_DAEMON_HOST: "0.0.0.0" },
    });
    expect(config.host).toBe("0.0.0.0");
  });

  test("COMMA_DAEMON_LOG_LEVEL overrides default", () => {
    const config = loadDaemonConfig({
      configFile: join(tempDir, "none.json"),
      env: { COMMA_DAEMON_LOG_LEVEL: "debug" },
    });
    expect(config.logLevel).toBe("debug");
  });

  test("COMMA_DAEMON_LOG_FILE sets logFile", () => {
    const config = loadDaemonConfig({
      configFile: join(tempDir, "none.json"),
      env: { COMMA_DAEMON_LOG_FILE: "/tmp/daemon.log" },
    });
    expect(config.logFile).toBe("/tmp/daemon.log");
  });

  test("COMMA_DAEMON_PROVIDER_CACHE_DIR overrides default", () => {
    const config = loadDaemonConfig({
      configFile: join(tempDir, "none.json"),
      env: { COMMA_DAEMON_PROVIDER_CACHE_DIR: "/custom/cache" },
    });
    expect(config.providerCacheDir).toBe("/custom/cache");
  });

  test("COMMA_DAEMON_PID_FILE overrides default", () => {
    const config = loadDaemonConfig({
      configFile: join(tempDir, "none.json"),
      env: { COMMA_DAEMON_PID_FILE: "/custom/pid" },
    });
    expect(config.pidFile).toBe("/custom/pid");
  });

  test("empty env var is ignored (uses default)", () => {
    const config = loadDaemonConfig({
      configFile: join(tempDir, "none.json"),
      env: { COMMA_DAEMON_PORT: "" },
    });
    expect(config.port).toBe(7422);
  });
});

// loadDaemonConfig — priority (env > file > defaults)

describe("loadDaemonConfig priority", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("env var beats config file", () => {
    const configFile = writeJsonConfig(tempDir, { port: 8080 });
    const config = loadDaemonConfig({
      configFile,
      env: { COMMA_DAEMON_PORT: "9090" },
    });
    expect(config.port).toBe(9090);
  });

  test("config file beats default", () => {
    const configFile = writeJsonConfig(tempDir, { port: 8080 });
    const config = loadDaemonConfig({ configFile, env: cleanEnv() });
    expect(config.port).toBe(8080);
  });

  test("env var beats config file beats default for all fields", () => {
    const configFile = writeJsonConfig(tempDir, {
      port: 8080,
      host: "192.168.1.1",
      logLevel: "warn",
    });

    const config = loadDaemonConfig({
      configFile,
      env: {
        COMMA_DAEMON_PORT: "3000",
        // host not in env — should use config file value
        // logLevel not in env — should use config file value
      },
    });

    expect(config.port).toBe(3000); // env wins
    expect(config.host).toBe("192.168.1.1"); // file wins over default
    expect(config.logLevel).toBe("warn"); // file wins over default
  });
});

// loadDaemonConfig — validation

describe("loadDaemonConfig validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("throws on invalid port from env var", () => {
    expect(() =>
      loadDaemonConfig({
        configFile: join(tempDir, "none.json"),
        env: { COMMA_DAEMON_PORT: "999999" },
      }),
    ).toThrow(/Invalid port/);
  });

  test("throws on non-numeric port from env var", () => {
    expect(() =>
      loadDaemonConfig({
        configFile: join(tempDir, "none.json"),
        env: { COMMA_DAEMON_PORT: "abc" },
      }),
    ).toThrow(/Invalid port/);
  });

  test("throws on invalid logLevel from env var", () => {
    expect(() =>
      loadDaemonConfig({
        configFile: join(tempDir, "none.json"),
        env: { COMMA_DAEMON_LOG_LEVEL: "verbose" },
      }),
    ).toThrow(/Invalid logLevel/);
  });
});

// loadDaemonConfig — COMMA_DAEMON_CONFIG_FILE env var

describe("loadDaemonConfig config file path resolution", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("COMMA_DAEMON_CONFIG_FILE env var overrides default config path", () => {
    const configFile = writeJsonConfig(tempDir, { port: 5555 });
    const config = loadDaemonConfig({
      env: { COMMA_DAEMON_CONFIG_FILE: configFile },
    });
    expect(config.port).toBe(5555);
    expect(config.configFile).toBe(configFile);
  });

  test("explicit configFile option beats COMMA_DAEMON_CONFIG_FILE env var", () => {
    mkdirSync(join(tempDir, "env"), { recursive: true });
    const envConfig = writeJsonConfig(join(tempDir, "env"), { port: 1111 });

    const optConfig = writeJsonConfig(tempDir, { port: 2222 });

    const config = loadDaemonConfig({
      configFile: optConfig,
      env: { COMMA_DAEMON_CONFIG_FILE: envConfig },
    });
    expect(config.port).toBe(2222);
  });
});
