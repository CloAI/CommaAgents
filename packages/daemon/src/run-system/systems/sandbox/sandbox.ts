import { createSandbox, type GuardCallbacks } from "@comma-agents/core/sandbox";
import type { DaemonSystem, SystemRunContext } from "../systems.types";
import { DAEMON_SANDBOX_OPTIONS } from "./sandbox.constants";

export function createSandboxSystem(): DaemonSystem {
  return {
    name: "sandbox",

    onRunPrepare(runContext: SystemRunContext): void {
      const { run, actions, sink, systemData } = runContext;
      const permissionRequester = systemData.get("permissionRequester");

      if (!permissionRequester) {
        throw new Error("SandboxSystem requires PermissionSystem to run first");
      }

      const sandboxCallbacks: GuardCallbacks = {
        onAsk: permissionRequester,
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

      const sandbox = createSandbox(
        { cwd: run.cwd, ...DAEMON_SANDBOX_OPTIONS },
        sandboxCallbacks,
      );
      systemData.set("sandbox", sandbox);

      actions.register("updatePolicy", run.id, (patch, toolName): boolean => {
        sandbox.updatePolicy(patch, toolName);
        return true;
      });
    },
  };
}
