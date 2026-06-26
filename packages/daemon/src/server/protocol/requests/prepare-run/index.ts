import type { HandlerContext } from "../../dispatcher.types";
import type { PrepareRunMessage } from "./prepare-run.schema";

export { PrepareRunMessage } from "./prepare-run.schema";

export async function handlePrepareRun(
  message: PrepareRunMessage,
  context: HandlerContext<"prepare_run">,
): Promise<void> {
  try {
    const prepared = await context.runSystem.prepareRun(context.clientId, {
      runId: message.runId,
      strategyPath: message.strategyPath,
      modelOverride: message.modelOverride,
      cwd: message.cwd,
      manifestPath: message.manifestPath,
    });
    context.reply({
      type: "run_prepared",
      ...prepared,
      agents: [...prepared.agents],
      mcpServers: prepared.mcpServers.map((server) => ({
        ...server,
        assignedAgents: [...server.assignedAgents],
      })),
      conversation: {
        records: [...prepared.conversation.records],
        retentionEvents: [...prepared.conversation.retentionEvents],
        inputs: [...prepared.conversation.inputs],
      },
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (error) {
    context.reply({
      type: "error",
      code: "PREPARE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
