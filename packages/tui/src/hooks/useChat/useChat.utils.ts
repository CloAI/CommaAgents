import type { ChatRun, ChatRunId, CreateRunInit } from "./useChat.types";

function deriveLabelFromPath(strategyPath: string): string {
  const segments = strategyPath.split("/");
  const fileName = segments[segments.length - 1] ?? strategyPath;
  return fileName.replace(/\.(json|yaml|yml)$/u, "");
}

/** Construct a fresh local chat run in the idle state. */
export function createInitialChatRun(
  chatRunId: ChatRunId,
  init: CreateRunInit,
): ChatRun {
  const now = Date.now();
  return {
    id: chatRunId,
    daemonRunId: null,
    label:
      init.label ??
      (init.strategyPath ? deriveLabelFromPath(init.strategyPath) : "New run"),
    strategyPath: init.strategyPath ?? null,
    strategyName: null,
    status: "idle",
    runStatus: null,
    error: null,
    pendingExecution: null,
    pendingInputAgent: null,
    pendingPermissionRequests: [],
    pendingQuestionRequests: [],
    messages: [],
    activeLaunchStrategyIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Return the innermost active spawned-strategy tool-call id for a run. */
export function getActiveLaunchStrategyId(
  chatRun: ChatRun,
): string | undefined {
  return chatRun.activeLaunchStrategyIds[
    chatRun.activeLaunchStrategyIds.length - 1
  ];
}
