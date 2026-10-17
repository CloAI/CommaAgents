import { getLogger } from "@logtape/logtape";
import { dirname, resolve } from "node:path";
import { CommaProjectManifestSchema } from "@comma-agents/core/hub";
import type { AgentCallResult, LoadedStrategy } from "@comma-agents/core";
import type { RunResultSummary, StrategyLoaderInputs } from "../runs.types";
import type { RunEntry } from "../state/state.types";
import type { LoadRunStrategyOptions } from "./execution.types";

const logger = getLogger(["comma", "daemon", "plugins", "runs", "runtime"]);

/**
 * Reject pending input and release resources in reverse acquisition order.
 * @param {RunEntry} entry - Run whose resources are released.
 * @returns {Promise<void>} Resolves after cleanup.
 * @internal
 */
export async function cleanupRunEntry(entry: RunEntry): Promise<void> {
  for (const pending of entry.pendingInput.values()) {
    pending.cleanup();
    pending.reject(new DOMException("Run stopped", "AbortError"));
  }
  entry.pendingInput.clear();
  for (const dispose of entry.disposers.reverse()) {
    try {
      await dispose();
    } catch (error) {
      logger.warning(
        `Run cleanup failed for ${entry.snapshot.runId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  entry.disposers.length = 0;
}

/**
 * Stop the current operation when its run was cancelled.
 * @param {AbortSignal} signal - Run or strategy cancellation signal.
 * @returns {void} Nothing when the operation may continue.
 * @internal
 */
export function throwIfRunAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Run stopped", "AbortError");
  }
}

/**
 * Merge provider inputs while rejecting conflicting owners and MCP tools.
 * @param {Partial<StrategyLoaderInputs>} target - Accumulated loader inputs.
 * @param {Partial<StrategyLoaderInputs>} incoming - Inputs supplied by this provider.
 * @param {Map<keyof StrategyLoaderInputs, string>} ownerByField - Provider ownership by loader field.
 * @param {string} providerName - Provider name used in conflict errors.
 * @returns {void} Nothing; updates accumulated inputs and ownership.
 * @internal
 */
export function mergeStrategyInputs(
  target: Partial<StrategyLoaderInputs>,
  incoming: Partial<StrategyLoaderInputs>,
  ownerByField: Map<keyof StrategyLoaderInputs, string>,
  providerName: string,
): void {
  for (const key of Object.keys(incoming) as (keyof StrategyLoaderInputs)[]) {
    const value = incoming[key];
    if (value === undefined) continue;

    if (key === "mcpToolsByAgent") {
      const existing = target.mcpToolsByAgent ?? {};
      const addition = incoming.mcpToolsByAgent ?? {};
      const merged = { ...existing };
      for (const [agentName, toolSet] of Object.entries(addition)) {
        const prior = merged[agentName];
        if (!prior) {
          merged[agentName] = toolSet;
          continue;
        }
        const overlappingTool = [
          ...Object.keys(toolSet.tools),
          ...Object.keys(toolSet.origins),
        ].find(
          (toolName) => toolName in prior.tools || toolName in prior.origins,
        );
        if (overlappingTool) {
          throw new Error(
            `Preparation ${providerName} provides duplicate MCP tool ${agentName}/${overlappingTool}`,
          );
        }
        merged[agentName] = {
          tools: { ...prior.tools, ...toolSet.tools },
          origins: { ...prior.origins, ...toolSet.origins },
        };
      }
      Object.assign(target, { mcpToolsByAgent: merged });
      ownerByField.set(key, providerName);
      continue;
    }

    if (target[key] !== undefined) {
      throw new Error(
        `Preparation ${providerName} and ${ownerByField.get(key)} both provide ${key}`,
      );
    }
    // Each field has one owner; the MCP agent map is combined above.
    Object.assign(target, { [key]: value });
    ownerByField.set(key, providerName);
  }
}

/**
 * Produce a durable result summary with JSON-safe strategy data.
 * @param {AgentCallResult} result - Completed strategy result.
 * @returns {RunResultSummary} Persistable summary of the final result.
 * @internal
 */
export function resultSummary(result: AgentCallResult): RunResultSummary {
  const data = "data" in result ? result.data : undefined;
  let serializedData: unknown;
  if (data !== undefined) {
    const json = JSON.stringify(data);
    if (json === undefined) {
      throw new Error("Strategy result data must be JSON-safe");
    }
    serializedData = JSON.parse(json) as unknown;
  }
  return {
    version: 1,
    text: result.text,
    finishReason: result.finishReason,
    usage: result.usage,
    ...(data !== undefined ? { data: serializedData } : {}),
  };
}

/**
 * Load a strategy after its run-scoped services are available.
 *
 * @param {LoadRunStrategyOptions} options - Strategy and runtime inputs.
 * @returns {Promise<LoadedStrategy>} The executable strategy.
 */
export async function loadRunStrategy({
  strategyPath,
  manifestPath,
  modelOverride,
  runId,
  inputCollector,
  launchStrategy,
  strategyInputs,
  hubManager,
}: LoadRunStrategyOptions): Promise<LoadedStrategy> {
  // Load only the strategy module; runs has no dependency on the core barrel.
  const { loadProject, loadStrategyFromString, readStrategyFile } =
    await import("@comma-agents/core/strategy");
  if (manifestPath) {
    if (hubManager) {
      const installed = await hubManager.listInstalled();
      const managed = installed.find(
        (item) =>
          resolve(item.path, "comma-project.json") === resolve(manifestPath),
      );
      if (managed) {
        const manifest = CommaProjectManifestSchema.parse(
          JSON.parse(await Bun.file(manifestPath).text()),
        );
        if (
          manifest.permissions?.executesCode &&
          !(await hubManager.isExecutableCodeApproved(manifestPath))
        ) {
          throw new Error(
            `Executable code is not approved for installed Hub package ${manifest.name}`,
          );
        }
      }
    }
    await loadProject(manifestPath);
  }

  const strategyFile = await readStrategyFile(strategyPath);
  return loadStrategyFromString(strategyFile.content, strategyFile.format, {
    ...strategyInputs,
    inputCollector,
    launchStrategy,
    modelOverride,
    strategyDir: dirname(strategyPath),
    runId,
  });
}
