// Tests for daemon configuration.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { getApplicationDataDirectory } from "@comma-agents/core";
import { resetDaemonDefaultOverrides } from "../defaults";
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

/**
 * Clean env — no COMMA_DAEMON_* variables.
 *
 * @returns {Record<string, string | undefined>} Empty environment override map.
 */
function cleanEnv(): Record<string, string | undefined> {
  return {};
}

afterEach(resetDaemonDefaultOverrides);

// getApplicationDataDirectory

describe("getApplicationDataDirectory", () => {
  test("returns the shared .comma directory", () => {
    const dir = getApplicationDataDirectory();
    expect(dir).toBe(join(homedir(), ".comma"));
  });

  test("returns path under home directory", () => {
    const dir = getApplicationDataDirectory();
    const home = homedir();
    expect(dir.startsWith(home)).toBe(true);
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
      expect(config.pidFile).toContain("daemon.pid");
      expect(config.configFile).toBe(configFile);
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
      expect(config.pidFile).toContain(".comma");
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

describe("console and payload configuration", () => {
  let directory: string;
  beforeEach(() => {
    directory = createTempDir();
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  test("should preserve JSON defaults and use text for explicit console enablement", () => {
    const configFile = join(directory, "missing.json");
    expect(loadDaemonConfig({ configFile, env: {} })).toMatchObject({
      console: true,
      consoleFormat: "json",
      logPayloads: false,
    });
    expect(
      loadDaemonConfig({ configFile, env: { COMMA_DAEMON_CONSOLE: "true" } }),
    ).toMatchObject({
      console: true,
      consoleFormat: "text",
    });
  });

  test("should resolve environment over file values and enable debug for payloads", () => {
    const configFile = writeJsonConfig(directory, {
      console: true,
      consoleFormat: "json",
      logPayloads: true,
    });
    expect(loadDaemonConfig({ configFile, env: {} })).toMatchObject({
      logLevel: "debug",
      logPayloads: true,
    });
    expect(
      loadDaemonConfig({
        configFile,
        env: {
          COMMA_DAEMON_CONSOLE: "false",
          COMMA_DAEMON_CONSOLE_FORMAT: "text",
          COMMA_DAEMON_LOG_PAYLOADS: "false",
        },
      }),
    ).toMatchObject({
      console: false,
      consoleFormat: "text",
      logPayloads: false,
    });
    expect(
      loadDaemonConfig({ configFile, env: { COMMA_DAEMON_LOG_LEVEL: "trace" } })
        .logLevel,
    ).toBe("trace");
  });

  test("should reject invalid boolean and format environment values", () => {
    const configFile = join(directory, "missing.json");
    for (const name of [
      "COMMA_DAEMON_CONSOLE",
      "COMMA_DAEMON_LOG_PAYLOADS",
      "COMMA_DAEMON_CONSOLE_FORMAT",
    ]) {
      expect(() =>
        loadDaemonConfig({ configFile, env: { [name]: "invalid" } }),
      ).toThrow(name);
    }
    expect(DaemonConfigFileSchema.safeParse({ console: "false" }).success).toBe(
      false,
    );
    expect(
      DaemonConfigFileSchema.safeParse({ consoleFormat: "xml" }).success,
    ).toBe(false);
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

describe("skill discovery configuration", () => {
  test("should resolve additional roots relative to the config file and expand home paths", () => {
    const directory = createTempDir();
    try {
      const configFile = writeJsonConfig(directory, {
        skills: {
          additionalDirectories: [
            "shared-skills",
            "~/skills",
            "/opt/team-skills",
          ],
        },
      });
      const config = loadDaemonConfig({ configFile, env: cleanEnv() });
      expect(config.skills.additionalDirectories).toEqual([
        join(directory, "shared-skills"),
        join(homedir(), "skills"),
        "/opt/team-skills",
      ]);
      writeJsonConfig(directory, {});
      expect(
        loadDaemonConfig({ configFile, env: cleanEnv() }).skills
          .additionalDirectories,
      ).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test("should reject blank roots and unknown skill settings", () => {
    expect(
      DaemonConfigFileSchema.safeParse({
        skills: { additionalDirectories: [" "] },
      }).success,
    ).toBe(false);
    expect(
      DaemonConfigFileSchema.safeParse({ skills: { unknown: true } }).success,
    ).toBe(false);
  });
});
