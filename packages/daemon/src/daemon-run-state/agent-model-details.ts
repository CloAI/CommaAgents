import { getQualifiedModelMetadata } from "@comma-agents/core";
import type { AgentOutputMessage } from "../server/protocol/responses/agent-output";

export type AgentModelDetails = Pick<
  AgentOutputMessage,
  "model" | "contextWindow"
>;

export function resolveAgentModelDetails(
  model: string | undefined,
): AgentModelDetails {
  if (model === undefined) return {};

  const contextWindow = getQualifiedModelMetadata(model)?.contextWindow;
  return {
    model,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
  };
}
