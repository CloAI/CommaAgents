import { createRunMcpRuntime, resolveRunMcpConfig } from "../../mcp";
import type { RunStore } from "../../run-store";
import type { DaemonSystem, SystemRunContext } from "../systems.types";

/** Own MCP clients for the lifetime of one prepared run execution. */
export function createMcpSystem(runStore: RunStore): DaemonSystem {
  return {
    name: "mcp",

    async onRunPrepare({
      run,
      cwd,
      strategyPath,
      systemData,
    }: SystemRunContext): Promise<void> {
      const config = await resolveRunMcpConfig({
        strategyPath,
        cwd,
        runId: run.id,
        runStore,
        persistDefaults: true,
      });
      const runtime = await createRunMcpRuntime(config);
      systemData.set("mcpConnectionManager", runtime.manager);
      systemData.set("mcpToolsByAgent", runtime.toolsByAgent);
      systemData.set("mcpServerStatuses", runtime.statuses);
    },

    async onRunCleanup({ systemData }): Promise<void> {
      await systemData.get("mcpConnectionManager")?.close();
    },
  };
}
