import { inSandbox } from "@comma-agents/core";
import type {
  DaemonSystem,
  StrategyLoadedContext,
  SystemRunContext,
} from "../systems.types";

export function createSandboxSystem(): DaemonSystem {
  return {
    name: "sandbox",

    onRunStart(runContext: SystemRunContext): void {
      const { run, sink, runActionRegistry } = runContext;

      runActionRegistry.register(
        "updatePolicy",
        run.id,
        (policy: unknown): boolean => {
          const sandbox = runContext.systemData.get("sandbox");
          if (!sandbox) return false;

          const { toolName, mode, paths } = policy as {
            toolName?: string;
            mode: "allow" | "deny" | "ask";
            paths: string[];
          };

          sandbox.updatePolicy(toolName, mode, paths);

          sink.broadcast(run.id, {
            type: "policy_updated",
            runId: run.id,
            toolName,
            mode,
            paths,
            ts: new Date().toISOString(),
          });

          return true;
        },
      );
    },

    onStrategyLoaded(strategyContext: StrategyLoadedContext): void {
      const { strategy, run, sink, systemData } = strategyContext;

      const permissionBridge = systemData.get("permissionBridge");
      const questionBridge = systemData.get("questionBridge");

      if (!permissionBridge || !questionBridge) {
        throw new Error(
          "SandboxSystem requires InteractionBridgesSystem to run first",
        );
      }

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

      const sandbox = inSandbox(strategy, sandboxConfig, sandboxCallbacks);
      systemData.set("sandbox", sandbox);
    },
  };
}
