import { readFileSync } from "node:fs";
import type {
  AgentCallResult,
  LaunchStrategyHandle,
  LaunchStrategyRequest,
} from "@comma-agents/core";
import {
  getCatalogProviderSync,
  inSandbox,
  loadStrategyFromString,
  parseModel,
  toModelInfo,
} from "@comma-agents/core";
import type { DaemonSystem, SystemRunContext } from "../systems.types";

export function createSubLaunchSystem(): DaemonSystem {
  return {
    name: "sub-launch",

    onRunPrepare(runContext: SystemRunContext): void {
      const { run, sink, systemData, logger, abortSignal } = runContext;

      const launchStrategy: LaunchStrategyHandle = async (
        request: LaunchStrategyRequest,
      ) => {
        const { strategyPath, input, modelOverride } = request;

        logger.info(
          `Launching sub-strategy from ${strategyPath} with input length ${input?.length ?? 0}`,
        );

        const permissionRequester = systemData.get("permissionRequester");
        const questionRequester = systemData.get("questionRequester");
        const inputCollector = systemData.get("inputCollector");
        const skillRegistry = systemData.get("skillRegistry");
        const _parentSandbox = systemData.get("sandbox");

        if (!permissionRequester || !questionRequester || !inputCollector) {
          throw new Error(
            "SubLaunchSystem requires input, permission, and question systems to run first",
          );
        }

        const content = readFileSync(strategyPath, "utf-8");
        const format = strategyPath.endsWith(".json") ? "json" : "yaml";

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

        const subStrategy = await loadStrategyFromString(content, format, {
          inputCollector: wrappedCollector,
          modelOverride,
          cwd: run.cwd,
          skillRegistry,
        });

        const sandboxConfig = {
          cwd: run.cwd,
          jail: false,
          allowAbsolutePaths: true,
          read: { default: "ask", allow: ["**"], deny: [] },
          write: { default: "ask", allow: ["**"], deny: [] },
          execute: { default: "ask", allow: ["**"], deny: [] },
        };

        const sandboxCallbacks = {
          onAsk: permissionRequester,
          onQuestion: questionRequester,
          onPolicyChange: (snapshot: {
            toolName: string;
            policies: unknown;
          }): void => {
            sink.broadcast(run.id, {
              type: "policy_updated",
              runId: run.id,
              tool: snapshot.toolName,
              policies: snapshot.policies,
              ts: new Date().toISOString(),
            });
          },
        };

        const _subSandbox = inSandbox(
          subStrategy,
          sandboxConfig,
          sandboxCallbacks,
        );

        for (const [agentName, agent] of Object.entries(subStrategy.agents)) {
          if (!agent.appendHook) continue;

          const isUserAgent = agent.config?.type === "user";
          const modelDetails = resolveModelDetails(agent.config?.model);

          agent.appendHook("beforeCall", (_message: string): void => {
            logger.debug(`Sub-strategy agent ${agentName} beforeCall`);
          });

          agent.appendHook("onStreamEvent", (event: unknown): void => {
            if (isUserAgent) return;

            sink.broadcast(run.id, {
              type: "agent_streaming",
              runId: run.id,
              agentName,
              ...modelDetails,
              event,
              ts: new Date().toISOString(),
            });
          });

          agent.appendHook("afterCallResult", (result: unknown): void => {
            const ts = new Date().toISOString();
            const agentResult = result as AgentCallResult;

            if (!isUserAgent) {
              sink.broadcast(run.id, {
                type: "agent_output",
                runId: run.id,
                agentName,
                ...modelDetails,
                text: agentResult.text,
                usage: agentResult.usage,
                ...(agentResult.contextTokens !== undefined
                  ? { contextTokens: agentResult.contextTokens }
                  : {}),
                ts,
              });
            }
          });
        }

        const flowCall = subStrategy.flow.call(input ?? "");
        const abortFlow = (): void => flowCall.abort();
        abortSignal.addEventListener("abort", abortFlow, { once: true });
        if (abortSignal.aborted) abortFlow();

        let result: AgentCallResult;
        try {
          result = await flowCall;
        } finally {
          abortSignal.removeEventListener("abort", abortFlow);
        }

        logger.info(
          `Sub-strategy completed with text length ${result.text.length}`,
        );

        return {
          text: result.text,
          usage: result.usage,
          finishReason: result.finishReason,
        };
      };

      systemData.set("launchStrategy", launchStrategy);
    },
  };
}

interface AgentModelDetails {
  readonly model?: string;
  readonly contextWindow?: number;
}

function resolveModelDetails(model: string | undefined): AgentModelDetails {
  if (!model) return {};

  try {
    const { providerId, modelId } = parseModel(model);
    const catalogModel = getCatalogProviderSync(providerId)?.models[modelId];
    const contextWindow = catalogModel
      ? toModelInfo(catalogModel).contextWindow
      : undefined;
    return {
      model,
      ...(contextWindow !== undefined ? { contextWindow } : {}),
    };
  } catch {
    return { model };
  }
}
