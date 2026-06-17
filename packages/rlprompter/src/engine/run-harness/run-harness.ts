// runIteration — execute one strategy iteration in an isolated temp workdir,
// capturing the produced text (agent_call) and file mutations (tool_mutation)
// onto a timeline. The base strategy file and the real working directory are
// never touched: overrides are applied to an in-memory copy and all file tools
// are jailed to a throwaway temp directory.

import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTimeline,
  type FlowHooks,
  hookIntoAgent,
  type InputCollector,
  inSandbox,
  loadStrategyFromString,
  type TimelineEvent,
} from "@comma-agents/core";
import { applyOverrides } from "../overrides";
import { createMutationCapture } from "./mutation-capture";
import type {
  RunIterationOptions,
  RunIterationResult,
} from "./run-harness.types";

/**
 * Run a single strategy iteration in isolation. See {@link RunIterationOptions}.
 *
 * The returned `tempDir` is left on disk so callers can inspect the resulting
 * files; cleanup is the caller's responsibility.
 */
export async function runIteration(
  options: RunIterationOptions,
): Promise<RunIterationResult> {
  const {
    strategy,
    overrides = [],
    input,
    seedDir,
    strategyDir,
    modelOverride,
    runId,
    signal,
    onEvent,
    onStreamEvent,
  } = options;

  // 1. Fresh isolated workdir, seeded from the fixture directory if provided.
  const tempDir = await mkdtemp(join(tmpdir(), "rlprompter-"));
  if (seedDir) {
    await cp(seedDir, tempDir, { recursive: true });
  }

  const timeline = createTimeline();
  const append = (event: TimelineEvent): void => {
    timeline.append(event);
    onEvent?.(event);
  };

  // 2. Apply overrides to an in-memory copy and load the strategy.
  const merged = applyOverrides(strategy, overrides);
  const inputCollector = createSeededCollector(input);

  const flowHooks: FlowHooks = {
    beforeStep: [
      ({ stepName }): void => {
        append({
          type: "step_started",
          ts: new Date().toISOString(),
          stepName,
        });
      },
    ],
    afterStep: [
      ({ stepName }): void => {
        append({
          type: "step_completed",
          ts: new Date().toISOString(),
          stepName,
        });
      },
    ],
  };

  const loaded = await loadStrategyFromString(JSON.stringify(merged), "json", {
    inputCollector,
    flowHooks,
    ...(strategyDir !== undefined ? { strategyDir } : {}),
    ...(modelOverride !== undefined ? { modelOverride } : {}),
    ...(runId !== undefined ? { runId } : {}),
  });

  // 3. Jail every agent's file tools to the temp workdir. Default-allow so
  //    autonomous runs never block on a permission prompt.
  inSandbox(loaded, {
    cwd: tempDir,
    jail: true,
    allowAbsolutePaths: false,
    forbiddenGlobs: [],
    read: { default: "allow", allow: ["**"], deny: [] },
    write: { default: "allow", allow: ["**"], deny: [] },
  });

  // 4. Hook every agent: capture conversation records + file mutations + stream.
  for (const agent of Object.values(loaded.agents)) {
    if (!agent.appendHook) continue;

    const mutationHooks = createMutationCapture({
      cwd: tempDir,
      agentName: agent.name,
      timeline,
      ...(onEvent !== undefined ? { emit: onEvent } : {}),
    });

    hookIntoAgent(agent, {
      ...mutationHooks,
      afterCallResult: [
        (): void => {
          const record = agent.getConversationContext?.().records().at(-1);
          if (!record) return;
          append({ type: "agent_call", ts: record.createdAt, record });
        },
      ],
      ...(onStreamEvent !== undefined
        ? {
            onStreamEvent: [
              (event): void => {
                onStreamEvent({ agentName: agent.name, event });
              },
            ],
          }
        : {}),
    });
  }

  // 5. Run, bracketed by run_started / run_completed.
  append({
    type: "run_started",
    ts: new Date().toISOString(),
    strategyPath: strategyDir ?? tempDir,
    strategyName: loaded.name,
    cwd: tempDir,
    initialInput: input,
    ...(modelOverride !== undefined ? { modelOverride } : {}),
  });

  const pending = loaded.flow.call(input);
  const onAbort = (): void => pending.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const result = await pending;
    append({
      type: "run_completed",
      ts: new Date().toISOString(),
      status: "completed",
    });
    return { events: timeline.events(), tempDir, result, status: "completed" };
  } catch (caught) {
    const cancelled = signal?.aborted === true;
    const status = cancelled ? "cancelled" : "error";
    const error = {
      code: cancelled ? "cancelled" : "run_error",
      message: caught instanceof Error ? caught.message : String(caught),
    };
    append({
      type: "run_completed",
      ts: new Date().toISOString(),
      status,
      ...(status === "error" ? { error } : {}),
    });
    return {
      events: timeline.events(),
      tempDir,
      status,
      error,
      result: {
        text: "",
        usage: { promptTokens: 0, completionTokens: 0 },
        finishReason: status,
        responseMessages: [],
        steps: [],
      },
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * An input collector that returns `input` exactly once (for the strategy's
 * first user-input request) and empty strings thereafter, so a single
 * iteration runs without an interactive prompt.
 */
function createSeededCollector(input: string): InputCollector {
  let consumed = false;
  return (): Promise<string> => {
    if (!consumed) {
      consumed = true;
      return Promise.resolve(input);
    }
    return Promise.resolve("");
  };
}
