#!/usr/bin/env bun
// Minimal entry point. Installs process-level error handlers before loading the
// rest of the app, then dynamically imports bootstrap so any module-load error
// is captured. Keep this file dependency-light.

import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ERROR_LOG = join(tmpdir(), "rlprompter-error.log");

function logError(label: string, error: Error): void {
  const message = `[${new Date().toISOString()}] ${label}: ${error.name}: ${error.message}\n${error.stack ?? ""}\n`;
  process.stderr.write(message);
  try {
    appendFileSync(ERROR_LOG, message);
  } catch {
    // Nothing more we can do.
  }
}

process.on("uncaughtException", (error: Error) => {
  logError("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  logError(
    "Unhandled rejection",
    reason instanceof Error ? reason : new Error(String(reason)),
  );
});

import("./bootstrap").catch((error: unknown) => {
  logError(
    "Failed to load app",
    error instanceof Error ? error : new Error(String(error)),
  );
  process.exit(1);
});
