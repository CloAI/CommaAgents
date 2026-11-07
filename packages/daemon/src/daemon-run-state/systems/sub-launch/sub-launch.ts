import { getLogger } from "@logtape/logtape";
import type {
  AgentCallResult,
  AgentStreamEvent,
  LaunchStrategyHandle,
  LaunchStrategyRequest,
} from "@comma-agents/core";
import { isUserAgentDef, loadStrategyFromString } from "@comma-agents/core";
import { loadProject, readStrategyFile } from "@comma-agents/core/strategy";
import type { HubManager } from "@comma-agents/core/hub";
import { toAgentStreamEventWire } from "../../../server/protocol/responses/from-core";
import { resolveAgentModelDetails } from "../../agent-model-details";
import { assertProjectCodeApproved } from "../../prepare-strategy";
import type { RunRepository } from "../../run-repository";
import { createRunMcpRuntime, resolveRunMcpConfig } from "../mcp";
import type { DaemonSystem, SystemRunContext } from "../systems.types";

const logger = getLogger(["comma", "daemon", "sub-launch"]);

export function createSubLaunchSystem(
  hubManager?: HubManager,
  runRepository?: RunRepository,
): DaemonSystem {
  return {
    name: "sub-launch",
    onRunPrepare(runContext: SystemRunContext): void {
      const { run, messageSender, systemData, abortSignal } = runContext;

      const launchStrategy: LaunchStrategyHandle = async (
        request: LaunchStrategyRequest,
      ) => {
        const { strategyPath, manifestPath, input } = request;

        logger.info(
          `Launching sub-strategy from ${strategyPath} with input length ${input?.length ?? 0}`,
        );

        const questionRequester = systemData.get("questionRequester");
        const inputCollector = systemData.get("inputCollector");
        const skillRegistry = systemData.get("skillRegistry");
        const sandbox = systemData.get("sandbox");
        const nestedLaunchStrategy = systemData.get("launchStrategy");

        if (!questionRequester || !inputCollector || !sandbox) {
          throw new Error(
            "SubLaunchSystem requires input, question, and sandbox systems to run first",
          );
        }

        if (manifestPath) {
          await assertProjectCodeApproved(manifestPath, hubManager);
          await loadProject(manifestPath);
        }

        const strategyFile = await readStrategyFile(strategyPath);
        const mcpRuntime = runRepository
          ? await createRunMcpRuntime(
              await resolveRunMcpConfig({
                strategyPath,
                cwd: run.cwd,
                runId: run.id,
                runRepository,
              }),
            )
          : undefined;

        let seed = input && input.length > 0 ? input : null;
        const wrappedCollector = seed
          ? (
              request: Parameters<typeof inputCollector>[0],
            ): Promise<string> => {
              if (seed !== null) {
                const value = seed;
                seed = null;
                return Promise.resolve(value);
              }
              return inputCollector(request);
            }
          : inputCollector;

        const subStrategy = await loadStrategyFromString(
          strategyFile.content,
          strategyFile.format,
          {
            inputCollector: wrappedCollector,
            skillRegistry,
            sandbox,
            questionRequester,
            launchStrategy: nestedLaunchStrategy,
            runId: `${run.id}:${crypto.randomUUID()}`,
            ...(mcpRuntime ? { mcpToolsByAgent: mcpRuntime.toolsByAgent } : {}),
          },
        );

        for (const [agentName, agent] of Object.entries(subStrategy.agents)) {
          if (!agent.appendHook) {
            continue;
          }

          const agentDefinition = subStrategy.raw.agents[agentName];
          const isUserAgent =
            agentDefinition !== undefined && isUserAgentDef(agentDefinition);
          const modelDetails = resolveAgentModelDetails(agent.config?.model);

          agent.appendHook("beforeCall", (_message: string): void => {
            logger.debug(`Sub-strategy agent ${agentName} beforeCall`);
          });

          agent.appendHook("onStreamEvent", (event: AgentStreamEvent): void => {
            if (isUserAgent) {
              return;
            }

            messageSender.broadcast(run.id, {
              type: "agent_streaming",
              runId: run.id,
              agentName,
              ...modelDetails,
              event: toAgentStreamEventWire(event),
              ts: new Date().toISOString(),
            });
          });

          agent.appendHook(
            "afterCallResult",
            (result: AgentCallResult): void => {
              const ts = new Date().toISOString();

              if (!isUserAgent) {
                messageSender.broadcast(run.id, {
                  type: "agent_output",
                  runId: run.id,
                  agentName,
                  ...modelDetails,
                  text: result.text,
                  usage: {
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                  },
                  ...(result.contextUsage !== undefined
                    ? { contextUsage: result.contextUsage }
                    : {}),
                  ts,
                });
              }
            },
          );
        }

        const flowCall = subStrategy.flow.call(input ?? "");
        const abortFlow = (): void => flowCall.abort();
        abortSignal.addEventListener("abort", abortFlow, { once: true });
        if (abortSignal.aborted) {
          abortFlow();
        }

        let result: AgentCallResult;
        try {
          result = await flowCall;
        } finally {
          abortSignal.removeEventListener("abort", abortFlow);
          await mcpRuntime?.manager.close();
        }

        logger.info(
          `Sub-strategy completed with text length ${result.text.length}`,
        );

        return {
          strategyName: subStrategy.name,
          text: result.text,
          finishReason: result.finishReason,
        };
      };

      systemData.set("launchStrategy", launchStrategy);
    },
  };
}
