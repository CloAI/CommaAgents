import { getSandbox, inSandbox, pathPolicy } from "@comma-agents/core";
import type {
  DaemonSystem,
  StrategyLoadedContext,
  SystemRunContext,
} from "../systems.types";

export function createSandboxSystem(): DaemonSystem {
  return {
    name: "sandbox",

    onRunPrepare(runContext: SystemRunContext): void {
      const { run, actions } = runContext;

      actions.register("updatePolicy", run.id, (patch, toolName): boolean => {
        const sandbox = runContext.systemData.get("sandbox");
        if (!sandbox) return false;

        const guards = toolName
          ? [sandbox.guardFor(toolName)]
          : sandbox.guards.values();
        for (const guard of guards) {
          guard.addPolicy(
            pathPolicy(
              patch.mode,
              {
                default: patch.default ?? "ask",
                allow: patch.allow,
                deny: patch.deny,
              },
              sandbox.cwd,
            ),
          );
        }

        return true;
      });
    },

    onStrategyLoaded(strategyContext: StrategyLoadedContext): void {
      const { strategy, run, sink, systemData } = strategyContext;

      const permissionRequester = systemData.get("permissionRequester");
      const questionRequester = systemData.get("questionRequester");

      if (!permissionRequester || !questionRequester) {
        throw new Error(
          "SandboxSystem requires permission and question systems to run first",
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

      inSandbox(strategy, sandboxConfig, sandboxCallbacks);
      const sandbox = Object.values(strategy.agents)
        .map((agent) => getSandbox(agent))
        .find((candidate) => candidate !== undefined);
      if (!sandbox) {
        throw new Error("SandboxSystem failed to initialize the sandbox");
      }
      systemData.set("sandbox", sandbox);
    },
  };
}
