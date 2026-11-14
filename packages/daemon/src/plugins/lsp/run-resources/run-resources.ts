import { resolve } from "node:path";
import type { LspRequest, LspResponse } from "@comma-agents/core/language";
import type { RunPreparationContext, RunPreparationResult } from "../../runs";
import { ensureLspProcess, closeLspProcess } from "../process";
import type { LspContext } from "../state/state.types";
import type { LspRunResources } from "./run-resources.types";
import { waitForLspOperation } from "./run-resources.utils";

/**
 * Release a run's reference and close its process only after the final reference is gone.
 * @param {LspContext} context - Private feature state.
 * @param {LspRunResources} resources - Execution-owned language resources.
 * @returns {Promise<void>} Resolves after owned cleanup completes.
 * @internal
 */
export function disposeRunLsp(
  context: LspContext,
  resources: LspRunResources,
): Promise<void> {
  if (!resources.disposal) {
    resources.disposed = true;
    resources.controller.abort();
    resources.detachAbort();
    if (context.runs.get(resources.runId) === resources) {
      context.runs.delete(resources.runId);
    }
    const entry = resources.process;
    entry?.runIds.delete(resources.runId);
    resources.disposal =
      entry && entry.runIds.size === 0
        ? closeLspProcess(context, entry)
        : Promise.resolve();
  }
  return resources.disposal;
}

/**
 * Prepare a tool-facing language handle without starting a subprocess.
 * @param {LspContext} context - Private feature state.
 * @param {RunPreparationContext} preparation - Root or child execution settings.
 * @returns {RunPreparationResult} Lazy language service and execution cleanup.
 * @internal
 */
export function prepareRunLsp(
  context: LspContext,
  preparation: RunPreparationContext,
): RunPreparationResult {
  if (context.disposed) {
    throw new Error("LSP plugin has been disposed");
  }
  if (preparation.signal.aborted) {
    throw new DOMException("Run aborted", "AbortError");
  }
  if (context.runs.has(preparation.runId) && !preparation.staged) {
    throw new Error(`LSP resources already prepared: ${preparation.runId}`);
  }
  const onAbort = (): void => {
    // Run cleanup awaits the same disposal promise and reports any cleanup failure.
    void disposeRunLsp(context, resources).catch(() => {});
  };
  const resources: LspRunResources = {
    runId: preparation.runId,
    cwd: resolve(preparation.cwd),
    controller: new AbortController(),
    detachAbort: () => preparation.signal.removeEventListener("abort", onAbort),
    disposed: false,
  };
  const activate = (): void => {
    context.runs.set(resources.runId, resources);
  };
  if (!preparation.staged) {
    activate();
  }
  preparation.signal.addEventListener("abort", onAbort, { once: true });
  return {
    ...(preparation.staged ? { activate } : {}),
    strategyInputs: {
      languageService: {
        languageIds: ["typescript", "javascript"],
        request: (request, signal) => {
          if (resources.disposed) {
            return Promise.reject(
              new Error(`LSP run is unavailable: ${resources.runId}`),
            );
          }
          return requestRunLsp(context, resources.runId, request, signal);
        },
      },
    },
    dispose: () => disposeRunLsp(context, resources),
  };
}

/**
 * Acquire one reference per execution and query its shared working-directory backend.
 * @param {LspContext} context - Private feature state.
 * @param {string} runId - Execution making the request.
 * @param {LspRequest} request - Curated language operation.
 * @param {AbortSignal} signal - Optional tool cancellation.
 * @returns {Promise<LspResponse>} Query result from synchronized saved files.
 * @internal
 */
export async function requestRunLsp(
  context: LspContext,
  runId: string,
  request: LspRequest,
  signal?: AbortSignal,
): Promise<LspResponse> {
  const resources = context.runs.get(runId);
  if (context.disposed || !resources || resources.disposed) {
    throw new Error(`LSP run is unavailable: ${runId}`);
  }
  const requestSignal = signal
    ? AbortSignal.any([resources.controller.signal, signal])
    : resources.controller.signal;
  if (requestSignal.aborted) {
    throw new DOMException("LSP request aborted", "AbortError");
  }
  let entry = resources.process ?? context.processes.get(resources.cwd);
  if (entry?.closing) {
    await waitForLspOperation(entry.closing, requestSignal);
    entry = context.processes.get(resources.cwd);
  }
  if (context.disposed || resources.disposed || requestSignal.aborted) {
    throw new DOMException("LSP request aborted", "AbortError");
  }
  if (!entry) {
    entry = {
      cwd: resources.cwd,
      runIds: new Set(),
      phase: "stopped",
      recoveryUsed: false,
    };
    context.processes.set(resources.cwd, entry);
  }
  entry.runIds.add(runId);
  resources.process = entry;
  const backend = await waitForLspOperation(
    ensureLspProcess(context, entry),
    requestSignal,
  );
  const result = await waitForLspOperation(
    backend.request(request, requestSignal),
    requestSignal,
  );
  if (entry.backend === backend && entry.phase === "running") {
    entry.recoveryUsed = false;
  }
  return result;
}

/**
 * Abort execution handles and close every retained working-directory subprocess.
 * @param {LspContext} context - Private feature state.
 * @returns {Promise<void>} Resolves after all child processes exit.
 * @internal
 */
export async function disposeLsp(context: LspContext): Promise<void> {
  context.disposed = true;
  await Promise.all(
    [...context.runs.values()].map((resources) =>
      disposeRunLsp(context, resources),
    ),
  );
  await Promise.all(
    [...context.processes.values()].map((entry) =>
      closeLspProcess(context, entry),
    ),
  );
}
