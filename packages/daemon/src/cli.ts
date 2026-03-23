#!/usr/bin/env bun
// CLI entry point for the comma-agents daemon.
//
// Commands:
//   start [--foreground] [--port PORT] [--model-override P/M]   Start the daemon
//   stop                                                         Stop the daemon
//   status                                                       Show daemon status
//
// The daemon process is launched with `bun -i` (--install=fallback) so that
// missing @ai-sdk/* provider packages are auto-installed at import time.

import { join } from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { loadDaemonConfig, resolveDataDir } from "./config";
import { createJsonFileBackend } from "./credentials/backends/json-file";
import { createCredentialStore } from "./credentials/store";
import type { ProviderResolver } from "./executor/executor";
import { createLogger } from "./logger/logger";
import { createFileSink } from "./logger/sinks/file";
import { createStderrSink } from "./logger/sinks/stderr";
import type { LogSink } from "./logger/types";
import { isRunning, readPid, removePid, writePid } from "./pid";
import type { Credential } from "./protocol/shared";
import { createDaemon } from "./server";

// Argument parsing via yargs

interface StartArgs {
  foreground: boolean;
  port?: number;
  modelOverride?: string;
}

// Provider resolver — dynamic import with Bun auto-install

/**
 * Capitalize the first letter of a string.
 * "openai" → "Openai", "anthropic" → "Anthropic"
 */
function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build a ProviderResolver that dynamically imports @ai-sdk/<providerId>.
 *
 * When the daemon is launched with `bun -i`, missing packages are
 * auto-installed at import time. The resolver extracts the provider
 * factory from the module using the AI SDK naming convention:
 *
 *   @ai-sdk/openai    → createOpenai or default export
 *   @ai-sdk/anthropic → createAnthropic or default export
 *
 * Special handling:
 *   github-copilot → uses @ai-sdk/openai-compatible with the Copilot API
 *
 * Credential types map to provider options:
 *   - api    → { apiKey: credential.key }
 *   - oauth  → { apiKey: credential.accessToken }
 *   - custom → spread credential.data
 */
function buildProviderResolver(): ProviderResolver {
  return async (providerId: string, credential: Credential) => {
    // Extract API key from credential
    let apiKey: string | undefined;
    if (credential.type === "api") {
      apiKey = credential.key;
    } else if (credential.type === "oauth") {
      apiKey = credential.accessToken;
    }

    // -- GitHub Copilot: special handling --
    // Copilot uses @ai-sdk/openai-compatible, not @ai-sdk/github-copilot
    if (providerId === "github-copilot") {
      return buildCopilotProvider(apiKey);
    }

    // -- Standard providers --
    const packageName = `@ai-sdk/${providerId}`;

    let mod: Record<string, unknown>;
    try {
      mod = await import(packageName);
    } catch (err) {
      throw new Error(
        `Failed to load provider package ${packageName}. ` +
          `If running without auto-install, run: bun add ${packageName}\n` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // AI SDK convention: createProviderName or default export
    const factoryName = `create${capitalize(providerId)}`;
    const factory = (mod[factoryName] ?? mod.default) as
      | ((opts: Record<string, unknown>) => unknown)
      | undefined;

    if (typeof factory !== "function") {
      throw new Error(
        `${packageName} does not export "${factoryName}" or a default function. ` +
          `Available exports: [${Object.keys(mod).join(", ")}]`,
      );
    }

    // Build options from credential
    const opts: Record<string, unknown> = {};
    if (credential.type === "api") {
      opts.apiKey = credential.key;
    } else if (credential.type === "oauth") {
      opts.apiKey = credential.accessToken;
    } else if (credential.type === "custom") {
      Object.assign(opts, credential.data);
    }

    // The factory returns a callable provider: (modelID) => LanguageModel
    const provider = factory(opts);
    if (typeof provider !== "function") {
      throw new Error(
        `${packageName}.${factoryName}() did not return a callable provider function`,
      );
    }

    return provider as (modelID: string) => any;
  };
}

/**
 * Build a GitHub Copilot provider using @ai-sdk/openai-compatible.
 *
 * Copilot exposes an OpenAI-compatible API at https://api.githubcopilot.com
 * that requires a GitHub OAuth token (from device flow) as a Bearer token.
 */
async function buildCopilotProvider(apiKey: string | undefined): Promise<(modelID: string) => any> {
  if (!apiKey) {
    throw new Error(
      "No GitHub Copilot token available. " + "Set GITHUB_TOKEN or save credentials via the TUI.",
    );
  }

  const packageName = "@ai-sdk/openai-compatible";
  let mod: Record<string, unknown>;
  try {
    mod = await import(packageName);
  } catch (err) {
    throw new Error(
      `Failed to load ${packageName}. Install it with: bun add ${packageName}\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const createOpenAICompatible = mod.createOpenAICompatible as
    | ((config: Record<string, unknown>) => unknown)
    | undefined;

  if (typeof createOpenAICompatible !== "function") {
    throw new Error(
      `${packageName} does not export "createOpenAICompatible". ` +
        `Available exports: [${Object.keys(mod).join(", ")}]`,
    );
  }

  const provider = createOpenAICompatible({
    name: "github-copilot",
    baseURL: "https://api.githubcopilot.com",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Openai-Intent": "conversation-edits",
    },
  });

  if (typeof provider !== "function") {
    throw new Error("createOpenAICompatible() did not return a callable provider function");
  }

  return provider as (modelID: string) => any;
}

// Command: start

async function commandStart(args: StartArgs): Promise<void> {
  // Load config with optional port override
  const envOverrides: Record<string, string | undefined> = { ...process.env };
  if (args.port !== undefined) {
    envOverrides.COMMA_DAEMON_PORT = String(args.port);
  }
  const config = loadDaemonConfig({ env: envOverrides });

  // Check if daemon is already running
  const existingPid = readPid(config.pidFile);
  if (existingPid !== undefined && isRunning(existingPid)) {
    console.error(`Daemon is already running (PID: ${existingPid})`);
    process.exit(1);
  }

  // Clean up stale PID file if present
  if (existingPid !== undefined) {
    removePid(config.pidFile);
  }

  // Background mode: spawn a detached child and exit
  if (!args.foreground) {
    const spawnArgs = ["bun", "-i", "run", import.meta.path, "start", "--foreground"];
    if (args.port !== undefined) {
      spawnArgs.push("--port", String(args.port));
    }
    if (args.modelOverride !== undefined) {
      spawnArgs.push("--model-override", args.modelOverride);
    }

    const child = Bun.spawn(spawnArgs, {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    });
    child.unref();

    // Brief poll to verify PID file appears
    const deadline = Date.now() + 3000;
    let started = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      const pid = readPid(config.pidFile);
      if (pid !== undefined && isRunning(pid)) {
        console.log(`Daemon started in background (PID: ${pid})`);
        started = true;
        break;
      }
    }

    if (!started) {
      console.log("Daemon may still be starting. Check status with: comma-agents-daemon status");
    }

    process.exit(0);
  }

  // Foreground mode: run the daemon in this process
  // 1. Set up logger
  const sinks: LogSink[] = [createStderrSink()];
  if (config.logFile) {
    sinks.push(createFileSink(config.logFile));
  }
  const logger = createLogger({ level: config.logLevel, sinks });

  // 2. Set up credential store
  const dataDir = resolveDataDir();
  const credentialBackend = createJsonFileBackend({
    filePath: join(dataDir, "credentials.json"),
  });
  const credentialStore = createCredentialStore({ backend: credentialBackend });

  // 3. Build provider resolver
  const providerResolver = buildProviderResolver();

  // 4. Create and start daemon
  const daemon = createDaemon({
    config,
    credentialStore,
    providerResolver,
    logger,
    modelOverride: args.modelOverride,
  });

  try {
    await daemon.start();
  } catch (err) {
    logger.error(`Failed to start daemon: ${err}`);
    console.error(`Failed to start daemon: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 5. Write PID file
  writePid(config.pidFile);

  console.log(`Daemon listening on ${config.host}:${daemon.port} (PID: ${process.pid})`);
  if (args.modelOverride) {
    console.log(`  Model override: ${args.modelOverride}`);
  }
  // 6. Signal handlers for graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await daemon.stop();
    removePid(config.pidFile);
    logger.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Command: stop

async function commandStop(): Promise<void> {
  const config = loadDaemonConfig();

  const pid = readPid(config.pidFile);
  if (pid === undefined) {
    console.log("Daemon is not running (no PID file found)");
    process.exit(0);
  }

  if (!isRunning(pid)) {
    console.log("Daemon is not running (stale PID file cleaned up)");
    removePid(config.pidFile);
    process.exit(0);
  }

  // Send SIGTERM
  console.log(`Stopping daemon (PID: ${pid})...`);
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    console.error(`Failed to send SIGTERM: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Poll until the process dies (5 second timeout)
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) {
      removePid(config.pidFile);
      console.log("Daemon stopped");
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.error("Daemon did not stop within 5 seconds. You may need to kill it manually.");
  console.error(`  kill -9 ${pid}`);
  process.exit(1);
}

// Command: status

function commandStatus(): void {
  const config = loadDaemonConfig();

  const pid = readPid(config.pidFile);
  if (pid === undefined) {
    console.log("Daemon is not running");
    process.exit(0);
  }

  if (!isRunning(pid)) {
    console.log("Daemon is not running (stale PID file cleaned up)");
    removePid(config.pidFile);
    process.exit(0);
  }

  console.log(`Daemon is running (PID: ${pid})`);
  console.log(`  Config: ${config.configFile}`);
  console.log(`  PID file: ${config.pidFile}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Host: ${config.host}`);
}

// Command: help — now handled by yargs --help

// Main — yargs command routing

yargs(hideBin(process.argv))
  .scriptName("comma-agents-daemon")
  .usage("$0 <command> [options]")
  .command(
    "start",
    "Start the daemon",
    (y) =>
      y
        .option("foreground", {
          alias: "f",
          type: "boolean",
          default: false,
          describe: "Run in foreground (don't daemonize)",
        })
        .option("port", {
          alias: "p",
          type: "number",
          describe: "Override the listening port",
          coerce: (val: number) => {
            if (val < 1 || val > 65535) {
              throw new Error(`Invalid port: ${val}. Must be between 1 and 65535.`);
            }
            return val;
          },
        })
        .option("model-override", {
          type: "string",
          describe: "Override model for all agents (e.g., github-copilot/gpt-4o)",
          coerce: (val: string) => {
            if (!val.includes("/")) {
              throw new Error(
                `Invalid model override: "${val}". Expected format: providerID/modelID`,
              );
            }
            return val;
          },
        })
        .example("$0 start", "Start in background")
        .example("$0 start --foreground", "Start in foreground")
        .example("$0 start --port 8080", "Start on port 8080")
        .example(
          "$0 start --foreground --model-override github-copilot/gpt-4o",
          "Start with model override",
        ),
    async (argv) => {
      await commandStart({
        foreground: argv.foreground,
        port: argv.port,
        modelOverride: argv.modelOverride as string | undefined,
      });
    },
  )
  .command("stop", "Stop the daemon", {}, async () => {
    await commandStop();
  })
  .command("status", "Show daemon status", {}, () => {
    commandStatus();
  })
  .demandCommand(1, "Please specify a command: start, stop, or status")
  .strict()
  .help()
  .alias("h", "help")
  .version(false)
  .fail((msg, err) => {
    if (err) {
      console.error(`Fatal error: ${err.message}`);
    } else if (msg) {
      console.error(msg);
    }
    process.exit(1);
  })
  .parse();
