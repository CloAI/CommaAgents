import { z } from "zod";

import { discoverStrategies } from "../../../strategy/discover/discover";
import { readStrategyFile } from "../../../strategy/discover/discover.utils";
import { loadStrategyFromString } from "../../../strategy/loader/loader";
import type { LoadStrategyOptions } from "../../../strategy/loader/loader.types";
import { loadProject } from "../../../strategy/loader/project-loader";
import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { LaunchStrategyData } from "./launch-strategy.types";

export const launchStrategyParams = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      "Strategy name as advertised by list_strategy. Must match a `name` field exactly.",
    ),
  input: z
    .string()
    .describe(
      "Initial message passed to the strategy's entry flow. Use an empty string when the entry flow is a user agent that prompts for input on its own.",
    ),
  modelOverride: z
    .string()
    .optional()
    .describe(
      "Optional provider/model override (`providerID/modelID`) applied to every LLM agent in the sub-strategy.",
    ),
});

/**
 * Build the `launch_strategy` tool.
 *
 * Resolves `name` via {@link discoverStrategies}, then either delegates
 * to the runtime-supplied {@link ToolContext.launchStrategy} handle (in
 * the daemon, so nested agent activity is broadcast to the parent run)
 * or falls back to an in-process `loadStrategyFromString` +
 * `flow.call(input)` invocation when no handle is configured.
 */
export function createLaunchStrategyTool(): ToolDefinition<
  typeof launchStrategyParams,
  LaunchStrategyData
> {
  return defineTool<typeof launchStrategyParams, LaunchStrategyData>({
    description: describeTool({
      purpose: [
        "Launch one of the strategies returned by list_strategy and return its final output.",
        "The launched strategy runs synchronously to completion; this call resolves only when the entry flow finishes.",
      ],
      inputs: [
        {
          name: "name",
          type: "string",
          required: true,
          description:
            "Strategy `name` to launch. Call list_strategy first to discover valid names.",
        },
        {
          name: "input",
          type: "string",
          required: true,
          description:
            "Initial message passed to the sub-strategy's entry flow.",
        },
        {
          name: "modelOverride",
          type: "string",
          required: false,
          description:
            'Provider/model override applied to every LLM agent in the sub-strategy. Format: "providerID/modelID".',
        },
      ],
      outputs:
        "`{ strategyName, path, result, finishReason? }` — `result` is the final text produced by the sub-strategy's entry flow.",
      errors: [
        {
          kind: "not_found",
          description:
            "No discovered strategy matches `name`. Call list_strategy and pick a name from its output.",
        },
        {
          kind: "unknown",
          description:
            "The sub-strategy failed to load or execute (parse error, schema error, model resolution failure, etc.). Read the message for details.",
        },
      ],
      notes: [
        "When multiple discovered strategies share the same name (rare — possible when the same file is reachable via multiple sources), the highest-priority match (bundled > cwd > data) is launched.",
        "Sub-strategies inherit the parent run's sandbox state; tools inside them are subject to the same policies as the caller.",
      ],
    }),
    parameters: launchStrategyParams,
    execute: async (validatedArguments, toolContext) => {
      const { name, input, modelOverride } = validatedArguments;

      let discovered: Awaited<ReturnType<typeof discoverStrategies>>;
      try {
        discovered = await discoverStrategies();
      } catch (discoveryError) {
        return errorResult<LaunchStrategyData>(
          toolError(
            "unknown",
            `Strategy discovery failed: ${discoveryError instanceof Error ? discoveryError.message : String(discoveryError)}`,
            { recoverable: false },
          ),
        );
      }

      const match = discovered.strategies.find((s) => s.name === name);
      if (!match) {
        const available = discovered.strategies.map((s) => s.name);
        return errorResult<LaunchStrategyData>(
          toolError(
            "not_found",
            `No strategy named "${name}" is available. Known names: [${available.join(", ")}].`,
            {
              recoverable: available.length > 0,
              suggestedNextAction:
                "Call list_strategy to see the available names, then retry with one of them.",
              details: { available },
            },
          ),
        );
      }

      // Prefer the runtime-supplied handle so the daemon can broadcast
      // nested agent events as part of the parent run.
      if (toolContext.launchStrategy) {
        try {
          const result = await toolContext.launchStrategy({
            strategyPath: match.path,
            ...(match.manifestPath ? { manifestPath: match.manifestPath } : {}),
            input,
            ...(modelOverride ? { modelOverride } : {}),
          });
          const data: LaunchStrategyData = {
            strategyName: result.strategyName,
            path: match.path,
            result: result.text,
            ...(result.finishReason
              ? { finishReason: result.finishReason }
              : {}),
          };
          return okResult<LaunchStrategyData>(
            `Launched "${result.strategyName}" → ${result.text}`,
            { data },
          );
        } catch (caught) {
          return errorResult<LaunchStrategyData>(
            toolError(
              "unknown",
              `launch_strategy failed: ${caught instanceof Error ? caught.message : String(caught)}`,
              { recoverable: false },
            ),
          );
        }
      }

      // Fallback path: no runtime handle. Run in-process so the tool is
      // still usable in tests and embedded callers without a daemon.
      try {
        if (match.manifestPath) {
          await loadProject(match.manifestPath);
        }
        const { content, format } = await readStrategyFile(match.path);

        // Seed-aware wrapper around the inherited inputCollector. The
        // parent agent that invoked `launch_strategy` passed `input` as
        // the structured payload the sub-strategy should consume. If
        // the sub-strategy's first step is a `user` agent with
        // `requireInput: true` (the common case — `Plan`, `Build`,
        // `Standardize`, etc.), it would otherwise call the inherited
        // collector and re-prompt a human, ignoring the parent agent's
        // payload entirely. By pre-seeding the first user call with
        // `input`, the sub-strategy receives the parent's payload
        // transparently. Later user steps still delegate to the real
        // collector, preserving human-in-the-loop semantics for
        // follow-up turns inside the sub-strategy.
        let seed: string | null = input.length > 0 ? input : null;
        const baseCollector = toolContext.inputCollector;
        const seededCollector = baseCollector
          ? seed !== null
            ? (request: {
                agentName: string;
                prompt: string;
              }): Promise<string> => {
                if (seed !== null) {
                  const value = seed;
                  seed = null;
                  return Promise.resolve(value);
                }
                return baseCollector(request);
              }
            : baseCollector
          : undefined;

        const options: LoadStrategyOptions = {
          ...(toolContext.skillRegistry
            ? { skillRegistry: toolContext.skillRegistry }
            : {}),
          ...(seededCollector ? { inputCollector: seededCollector } : {}),
          ...(modelOverride ? { modelOverride } : {}),
        };
        const loaded = await loadStrategyFromString(content, format, options);
        const callResult = await loaded.flow.call(input);
        const data: LaunchStrategyData = {
          strategyName: loaded.name,
          path: match.path,
          result: callResult.text,
          ...(callResult.finishReason
            ? { finishReason: callResult.finishReason }
            : {}),
        };
        return okResult<LaunchStrategyData>(
          `Launched "${loaded.name}" → ${callResult.text}`,
          { data },
        );
      } catch (caught) {
        return errorResult<LaunchStrategyData>(
          toolError(
            "unknown",
            `launch_strategy failed: ${caught instanceof Error ? caught.message : String(caught)}`,
            { recoverable: false },
          ),
        );
      }
    },
  });
}
