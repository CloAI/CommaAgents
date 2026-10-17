import { resolve } from "node:path";
import type { LspProcessStatus } from "../lsp.types";
import type { LspContext } from "./state.types";

/**
 * Allocate private execution and subprocess registries.
 * @returns {LspContext} Empty plugin state.
 * @internal
 */
export function createLspContext(): LspContext {
  return { runs: new Map(), processes: new Map(), disposed: false };
}

/**
 * Inspect a working directory without acquiring or starting a subprocess.
 * @param {LspContext} context - Private feature state.
 * @param {string} cwd - Working directory to inspect.
 * @returns {LspProcessStatus} Current lifecycle and execution references.
 * @internal
 */
export function getLspStatus(
  context: LspContext,
  cwd: string,
): LspProcessStatus {
  const resolvedCwd = resolve(cwd);
  const entry = context.processes.get(resolvedCwd);
  return {
    cwd: resolvedCwd,
    phase: entry?.phase ?? "stopped",
    runIds: entry ? [...entry.runIds] : [],
    ...(entry?.backend?.transport.child.pid
      ? { pid: entry.backend.transport.child.pid }
      : {}),
    ...(entry?.error ? { error: entry.error } : {}),
  };
}
