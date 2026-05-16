// WebSocket test client + daemon lifecycle helpers for daemon E2E tests.
//
// Provides:
// - startTestDaemon() — create and start a daemon on a random port
// - connectTestClient() — connect a WebSocket client with waiter helpers
// - writeTempStrategy() — write strategy JSON to a temp file
// - settle() — wait for async side effects
//
// Model and credential resolution happen via global registries.
// startTestDaemon() calls setupMockModels() to register mock models.
// Tests must call resetModelRegistry() + resetGlobalDefaults() in afterEach.
//
// The connectTestClient() helper is an enhanced version of the
// `connectClient()` pattern from server.test.ts, with:
// - Type-safe message predicates
// - Better timeout error messages
// - waitForN() for collecting multiple matching messages
// - clearMessages() for isolating test phases

import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Daemon } from "@comma-agents/daemon";
import { createDaemon } from "@comma-agents/daemon";
import { createMockLogger, setupMockModels } from "./mock-providers";

// Types

/** A test WebSocket client connected to a daemon. */
export interface TestClient {
  /** The underlying WebSocket. */
  readonly ws: WebSocket;

  /** All messages received (parsed JSON). */
  readonly messages: unknown[];

  /**
   * Wait for a message matching a predicate.
   * Checks already-received messages first, then waits for new ones.
   *
   * @param predicate - Function that returns `true` for the desired message
   * @param timeoutMs - Max time to wait (default: 5000ms)
   */
  waitForMessage(
    predicate: (msg: any) => boolean,
    timeoutMs?: number,
  ): Promise<unknown>;

  /**
   * Wait for a message with a specific `type` field.
   * Shorthand for `waitForMessage(m => m?.type === type)`.
   */
  waitForType(type: string, timeoutMs?: number): Promise<unknown>;

  /**
   * Wait for N messages matching a predicate.
   * Useful for collecting all step_started/step_completed pairs.
   *
   * @param n - Number of matching messages to collect
   * @param predicate - Function that returns `true` for desired messages
   * @param timeoutMs - Max time to wait for all N messages
   */
  waitForN(
    n: number,
    predicate: (msg: any) => boolean,
    timeoutMs?: number,
  ): Promise<unknown[]>;

  /**
   * Send a message to the daemon (JSON-serialized).
   */
  send(msg: unknown): void;

  /**
   * Close the WebSocket connection.
   */
  close(): void;

  /**
   * Clear the messages array. Useful for isolating test phases.
   */
  clearMessages(): void;
}

/** Options for starting a test daemon. */
export interface StartTestDaemonOptions {
  /** Bridge timeout in ms. 0 = no timeout. Default: 0. */
  bridgeTimeout?: number;
}

// Daemon lifecycle

/** Active daemons for cleanup. */
const activeDaemons: Daemon[] = [];

/**
 * Create and start a daemon on a random available port.
 *
 * The daemon is tracked for cleanup — call `stopAllDaemons()` in afterAll.
 *
 * @returns The started Daemon instance (with `.port` and `.url` available)
 */
export async function startTestDaemon(
  options?: StartTestDaemonOptions,
): Promise<Daemon> {
  // Register mock models in the global registry so the daemon can resolve them.
  setupMockModels();

  const daemon = createDaemon({
    config: {
      port: 0, // Random available port
      host: "127.0.0.1",
      logLevel: "error",
      logFile: undefined,
      providerCacheDir: join(tmpdir(), "providers"),
      pidFile: join(tmpdir(), `test-${crypto.randomUUID()}.pid`),
      configFile: join(tmpdir(), `test-${crypto.randomUUID()}.json`),
    },
    logger: createMockLogger(),
    bridgeTimeout: options?.bridgeTimeout ?? 0,
  });

  await daemon.start();
  activeDaemons.push(daemon);
  return daemon;
}

/**
 * Stop all tracked test daemons. Call this in afterAll().
 */
export async function stopAllDaemons(): Promise<void> {
  for (const d of activeDaemons) {
    try {
      await d.stop();
    } catch {
      // Ignore — daemon may already be stopped
    }
  }
  activeDaemons.length = 0;
}

// WebSocket client

/**
 * Connect a WebSocket test client to a daemon.
 *
 * Resolves when the connection is open and the client is ready.
 * Messages are accumulated in `client.messages` as parsed JSON.
 *
 * @param daemon - The daemon to connect to (must be started)
 * @param timeoutMs - Connection timeout (default: 5000ms)
 */
export function connectTestClient(
  daemon: Daemon,
  timeoutMs = 5000,
): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(daemon.url);
    const messages: unknown[] = [];
    const waiters: Array<{
      predicate: (msg: any) => boolean;
      resolve: (msg: unknown) => void;
      reject: (err: Error) => void;
    }> = [];

    // Connection timeout
    const connectionTimer = setTimeout(() => {
      ws.close();
      reject(
        new Error(
          `WebSocket connection timed out after ${timeoutMs}ms to ${daemon.url}`,
        ),
      );
    }, timeoutMs);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      messages.push(data);

      // Check waiters (scan backward for safe splice)
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(data)) {
          waiters[i].resolve(data);
          waiters.splice(i, 1);
        }
      }
    };

    ws.onopen = () => {
      clearTimeout(connectionTimer);

      const client: TestClient = {
        ws,
        messages,

        waitForMessage(
          predicate: (msg: any) => boolean,
          timeout = 5000,
        ): Promise<unknown> {
          // Check already-received messages
          const found = messages.find(predicate);
          if (found) return Promise.resolve(found);

          return new Promise<unknown>((res, rej) => {
            const timer = setTimeout(() => {
              const idx = waiters.findIndex((w) => w.resolve === res);
              if (idx >= 0) waiters.splice(idx, 1);
              rej(
                new Error(
                  `Timed out waiting for message (${timeout}ms). ` +
                    `Received ${messages.length} messages: ${JSON.stringify(messages, null, 2)}`,
                ),
              );
            }, timeout);

            waiters.push({
              predicate,
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
              reject: rej,
            });
          });
        },

        waitForType(type: string, timeout = 5000): Promise<unknown> {
          return client.waitForMessage((m: any) => m?.type === type, timeout);
        },

        async waitForN(
          n: number,
          predicate: (msg: any) => boolean,
          timeout = 5000,
        ): Promise<unknown[]> {
          const collected: unknown[] = [];
          const deadline = Date.now() + timeout;

          for (let i = 0; i < n; i++) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
              throw new Error(
                `Timed out waiting for message ${i + 1}/${n} (${timeout}ms total). ` +
                  `Collected ${collected.length} so far. ` +
                  `All messages: ${JSON.stringify(messages, null, 2)}`,
              );
            }

            // Find next matching message not yet collected
            const msg = await client.waitForMessage((m: any) => {
              if (!predicate(m)) return false;
              // Don't match already-collected messages
              return !collected.includes(m);
            }, remaining);

            collected.push(msg);
          }

          return collected;
        },

        send(msg: unknown): void {
          ws.send(JSON.stringify(msg));
        },

        close(): void {
          ws.close();
        },

        clearMessages(): void {
          messages.length = 0;
        },
      };

      resolve(client);
    };

    ws.onerror = (err) => {
      clearTimeout(connectionTimer);
      reject(new Error(`WebSocket connection error: ${err}`));
    };
  });
}

// Strategy file helpers

/** Tracked temp files for cleanup. */
const tempFiles: string[] = [];

/**
 * Write a strategy string to a temp file and return the path.
 *
 * @param content - Strategy JSON or YAML string
 * @param ext - File extension (default: "json")
 * @returns Absolute path to the temp file
 */
export async function writeTempStrategy(
  content: string,
  ext = "json",
): Promise<string> {
  const filename = `e2e-strategy-${crypto.randomUUID()}.${ext}`;
  const filePath = join(tmpdir(), filename);
  await Bun.write(filePath, content);
  tempFiles.push(filePath);
  return filePath;
}

/**
 * Clean up temp strategy files. Call this in afterEach().
 */
export async function cleanupTempFiles(): Promise<void> {
  for (const f of tempFiles) {
    try {
      const file = Bun.file(f);
      if (await file.exists()) {
        await Bun.write(f, ""); // Truncate
      }
    } catch {
      // Ignore
    }
  }
  tempFiles.length = 0;
}

// Utilities

import { sleep } from "@comma-agents/utils";

/**
 * Wait a short period for async side effects to settle.
 *
 * Wraps `sleep` from utils with a default of 50ms for ergonomic test usage.
 *
 * @param ms - Milliseconds to wait (default: 50)
 */
export function settle(ms = 50): Promise<void> {
  return sleep(ms);
}
