import { createTypeScriptTransport } from "../transport";
import { createTypeScriptBackend } from "../languages/typescript";
import type { TypeScriptBackend } from "../languages/typescript/typescript.types";
import type { TypeScriptTransport } from "../transport/transport.types";
import type { LspContext } from "../state/state.types";
import type { LanguageProcessEntry } from "./process.types";

function handleCrash(
  context: LspContext,
  entry: LanguageProcessEntry,
  transport: TypeScriptTransport,
  error: Error,
): void {
  if (
    context.disposed ||
    entry.closing ||
    context.processes.get(entry.cwd) !== entry
  ) {
    return;
  }
  entry.error = error.message;
  entry.phase = "failed";
  if (entry.runIds.size === 0 || entry.recoveryUsed) {
    // TODO: Define UI/agent recovery ownership, retry exhaustion, and unrecoverable states.
    return;
  }
  entry.recoveryUsed = true;
  entry.phase = "restarting";
  entry.recovery = (async () => {
    await transport.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    if (context.disposed || entry.closing || entry.runIds.size === 0) {
      return;
    }
    entry.backend = undefined;
    await startProcess(context, entry);
  })()
    .catch((restartError: unknown) => {
      if (!entry.closing && !context.disposed) {
        entry.phase = "failed";
        entry.error =
          restartError instanceof Error
            ? restartError.message
            : String(restartError);
        // TODO: Decide whether the UI or an agent initiates recovery after replacement startup fails.
      }
    })
    .finally(() => {
      entry.recovery = undefined;
    });
}

function startProcess(
  context: LspContext,
  entry: LanguageProcessEntry,
): Promise<TypeScriptBackend> {
  if (entry.startup) {
    return entry.startup;
  }
  entry.phase = entry.recoveryUsed ? "restarting" : "starting";
  entry.error = undefined;
  entry.startup = (async () => {
    const transport = createTypeScriptTransport({
      cwd: entry.cwd,
      onFailure: (error) => handleCrash(context, entry, transport, error),
    });
    const backend = createTypeScriptBackend(entry.cwd, transport);
    entry.backend = backend;
    try {
      await transport.request("configure", {
        hostInfo: "comma-agents",
        preferences: { includePackageJsonAutoImports: "off" },
      });
      if (entry.closing || context.disposed || entry.error) {
        throw new Error(entry.error ?? "LSP process stopped during startup");
      }
      entry.phase = "running";
      return backend;
    } catch (error) {
      await transport.close();
      throw error;
    }
  })()
    .catch((error: unknown) => {
      if (!entry.closing && !context.disposed && !entry.recovery) {
        entry.phase = "failed";
        entry.error = error instanceof Error ? error.message : String(error);
      }
      throw error;
    })
    .finally(() => {
      entry.startup = undefined;
    });
  return entry.startup;
}

/**
 * Obtain a running backend, sharing both initial startup and automatic recovery.
 * @param {LspContext} context - Private feature state.
 * @param {LanguageProcessEntry} entry - Shared working-directory entry.
 * @returns {Promise<TypeScriptBackend>} Running TypeScript backend.
 * @internal
 */
export async function ensureLspProcess(
  context: LspContext,
  entry: LanguageProcessEntry,
): Promise<TypeScriptBackend> {
  if (entry.recovery) {
    await entry.recovery;
  }
  if (entry.closing || context.disposed) {
    throw new Error("LSP process has been disposed");
  }
  if (entry.phase === "failed") {
    throw new Error(entry.error ?? "LSP process is unavailable");
  }
  if (entry.phase === "running" && entry.backend) {
    return entry.backend;
  }
  return startProcess(context, entry);
}

/**
 * Close a subprocess and remove it only after all startup/recovery work has settled.
 * @param {LspContext} context - Private feature state.
 * @param {LanguageProcessEntry} entry - Working-directory entry to close.
 * @returns {Promise<void>} Resolves after the subprocess exits.
 * @internal
 */
export function closeLspProcess(
  context: LspContext,
  entry: LanguageProcessEntry,
): Promise<void> {
  if (!entry.closing) {
    entry.phase = "stopping";
    entry.closing = (async () => {
      await entry.backend?.transport.close();
      await Promise.allSettled([entry.startup, entry.recovery]);
      if (context.processes.get(entry.cwd) === entry) {
        context.processes.delete(entry.cwd);
      }
    })();
  }
  return entry.closing;
}
