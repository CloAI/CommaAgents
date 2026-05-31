import { readFileSync } from "node:fs";
import type {
  LaunchStrategyHandle,
  LaunchStrategyRequest,
} from "@comma-agents/core";
import { inSandbox, loadStrategyFromString } from "@comma-agents/core";
import type { DaemonSystem, SystemRunContext } from "../systems.types";

export function createSubLaunchSystem(): DaemonSystem {
  return {
    name: "sub-launch",

    onRunStart(runContext: SystemRunContext): void {
      const { run, sink, systemData, logger } = runContext;

      const launchStrategy: LaunchStrategyHandle = async (
        request: LaunchStrategyRequest,
      ) => {
        const { strategyPath, input, modelOverride } = request;

        logger.info(
          `Launching sub-strategy from ${strategyPath} with input length ${input?.length ?? 0}`,
        );

        const permissionBridge = systemData.get("permissionBridge");
        const questionBridge = systemData.get("questionBridge");
        const inputBridge = systemData.get("inputBridge");
        const _parentSandbox = systemData.get("sandbox");

        if (!permissionBridge || !questionBridge || !inputBridge) {
          throw new Error(
            "SubLaunchSystem requires InteractionBridgesSystem to run first",
          );
        }

        const content = readFileSync(strategyPath, "utf-8");
        const format = strategyPath.endsWith(".json") ? "json" : "yaml";

        let seed = input && input.length > 0 ? input : null;
        const wrappedCollector = seed
          ? (agentName: string, prompt: string): Promise<string> => {
              if (seed !== null) {
                const value = seed;
                seed = null;
                return Promise.resolve(value);
              }
              return inputBridge.collector(agentName, prompt);
            }
          : inputBridge.collector;

        const subStrategy = await loadStrategyFromString(content, format, {
          inputCollector: wrappedCollector,
          modelOverride,
          cwd: run.cwd,
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
          onAsk: permissionBridge.requester,
          onQuestion: questionBridge.requester,
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

          agent.appendHook("beforeCall", (_message: string): void => {
            logger.debug(`Sub-strategy agent ${agentName} beforeCall`);
          });

          agent.appendHook("onStreamEvent", (event: unknown): void => {
            if (isUserAgent) return;

            sink.broadcast(run.id, {
              type: "agent_streaming",
              runId: run.id,
              agentName,
              event,
              ts: new Date().toISOString(),
            });
          });

          agent.appendHook("afterCallResult", (result: unknown): void => {
            const ts = new Date().toISOString();

            if (!isUserAgent) {
              sink.broadcast(run.id, {
                type: "agent_output",
                runId: run.id,
                agentName,
                text: (result as { text: string }).text,
                usage: (result as { usage: unknown }).usage,
                ts,
              });
            }
          });
        }

        const result = await subStrategy.flow.call(input ?? "");

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
