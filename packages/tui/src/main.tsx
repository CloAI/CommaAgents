// Bootstrap — this file must stay minimal.
//
// ES module `import` declarations are hoisted and executed as a static graph
// before ANY module body code runs. The only way to guarantee the console
// hijack fires before every other module is to:
//   1. Import (and therefore execute) logStore.ts synchronously here — and
//      import NOTHING else statically, so logStore is the first module to run.
//   2. Register process-level error handlers immediately after.
//   3. Dynamically import the rest of the app so it loads *after* step 1-2.
//
// Do NOT add any other static imports to this file.

import { appendFileSync } from "node:fs";
import { logStore } from "./hooks/useLogs/logStore";
import { DEBUG_LOG, LOG_FILE_PATH } from "./utils/debug";

// Step 2 — capture process-level exceptions into the store (and disk fallback).
function captureException(
  label: string,
  err: Error,
  options?: { readonly writeToStderr?: boolean },
): void {
  const message = `${label}: ${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
  logStore.push("error", message);

  if (options?.writeToStderr === true || !logStore.isCommitted()) {
    process.stderr.write(`${message}\n`);
  }

  if (DEBUG_LOG) {
    try {
      const timestamp = new Date().toISOString();
      appendFileSync(LOG_FILE_PATH, `[${timestamp}] ERROR ${message}\n`);
    } catch {
      // Writing the fallback file failed — nothing more we can do.
    }
  }
}

process.on("uncaughtException", (err: Error) => {
  captureException("Uncaught exception", err, { writeToStderr: true });
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  captureException("Unhandled rejection", err);
});

// Step 3 — dynamically import the rest of the app now that the store is live.
import("./bootstrap").catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  captureException("Failed to load app", error, { writeToStderr: true });
  process.exit(1);
});
