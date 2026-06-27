import type {
  AgentCallResult,
  AgentStreamEvent,
  GuardCallbacks,
  LaunchStrategyHandle,
  LaunchStrategyRequest,
  PermissionRequest,
  SandboxConfig,
} from "@comma-agents/core";
import {
  inSandbox,
  isUserAgentDef,
  loadProject,
  loadStrategyFromString,
  readStrategyFile,
} from "@comma-agents/core";
import type { HubManager } from "@comma-agents/core/hub";
import { toAgentStreamEventWire } from "../../../server/protocol/responses/from-core";
import { resolveAgentModelDetails } from "../../agent-model-details";
import { createRunMcpRuntime, resolveRunMcpConfig } from "../../mcp";
import { assertProjectCodeApproved } from "../../prepare-strategy";
import type { RunStore } from "../../run-store";
import type { DaemonSystem, SystemRunContext } from "../systems.types";

export function createSubLaunchSystem(
  hubManager?: HubManager,
  runStore?: RunStore,
): DaemonSystem {
  return {
    name: "sub-launch",

    onRunPrepare(runContext: SystemRunContext): void {
      const { run, sink, systemData, logger, abortSignal } = runContext;

      const launchStrategy: LaunchStrategyHandle = async (
        request: LaunchStrategyRequest,
      ) => {
        const { strategyPath, manifestPath, input, modelOverride } = request;

        logger.info(
          `Launching sub-strategy from ${strategyPath} with input length ${input?.length ?? 0}`,
        );

        const permissionRequester = systemData.get("permissionRequester");
        const questionRequester = systemData.get("questionRequester");
        const inputCollector = systemData.get("inputCollector");
        const skillRegistry = systemData.get("skillRegistry");

        if (!permissionRequester || !questionRequester || !inputCollector) {
          throw new Error(
            "SubLaunchSystem requires input, permission, and question systems to run first",
          );
        }

        if (manifestPath) {
          await assertProjectCodeApproved(manifestPath, hubManager);
          await loadProject(manifestPath);
        }

        const strategyFile = await readStrategyFile(strategyPath);
        const mcpRuntime = runStore
          ? await createRunMcpRuntime(
              await resolveRunMcpConfig({
                strategyPath,
                cwd: run.cwd,
                runId: run.id,
                runStore,
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
            modelOverride,
            skillRegistry,
            runId: `${run.id}:${crypto.randomUUID()}`,
            ...(mcpRuntime ? { mcpToolsByAgent: mcpRuntime.toolsByAgent } : {}),
          },
        );

        const sandboxConfig: Partial<SandboxConfig> = {
          cwd: run.cwd,
          jail: false,
          allowAbsolutePaths: true,
          read: { default: "ask", allow: ["**"], deny: [] },
          write: { default: "ask", allow: ["**"], deny: [] },
        };

        const sandboxCallbacks: GuardCallbacks = {
          // The guard dispatches the broader GuardPermissionRequest; the
          // daemon's requester only models the fs operations it handles.
          onAsk: (request) => permissionRequester(request as PermissionRequest),
          onQuestion: questionRequester,
          onPolicyChange: (snapshot): void => {
            sink.broadcast(run.id, {
              type: "policy_updated",
              runId: run.id,
              tool: snapshot.toolName,
              policies: [...snapshot.policies],
              ts: new Date().toISOString(),
            });
          },
        };

        inSandbox(subStrategy, sandboxConfig, sandboxCallbacks);

        for (const [agentName, agent] of Object.entries(subStrategy.agents)) {
          if (!agent.appendHook) continue;

          const agentDefinition = subStrategy.raw.agents[agentName];
          const isUserAgent =
            agentDefinition !== undefined && isUserAgentDef(agentDefinition);
          const modelDetails = resolveAgentModelDetails(agent.config?.model);

          agent.appendHook("beforeCall", (_message: string): void => {
            logger.debug(`Sub-strategy agent ${agentName} beforeCall`);
          });

          agent.appendHook("onStreamEvent", (event: AgentStreamEvent): void => {
            if (isUserAgent) return;

            sink.broadcast(run.id, {
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
                sink.broadcast(run.id, {
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
        if (abortSignal.aborted) abortFlow();

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
