import type { DiscoveredStrategy } from "@comma-agents/core";
import type { ChatRunId, PersistedRunMeta } from "../useChat.types";

export interface ChatRunLifecycle {
  readonly startStrategy: (
    strategyPath: string,
    input?: string,
    cwd?: string,
    manifestPath?: string,
  ) => ChatRunId;
  readonly continueRun: (
    chatRunId: ChatRunId,
    strategy: DiscoveredStrategy,
    input: string,
  ) => void;
  readonly loadPersistedRun: (meta: PersistedRunMeta) => ChatRunId;
  readonly stopChatRun: (chatRunId: ChatRunId) => void;
  readonly resetChatRun: (chatRunId: ChatRunId) => void;
  readonly removeChatRun: (chatRunId: ChatRunId) => void;
  readonly clearAllChatRuns: () => void;
  readonly confirmMcpPreparation: (
    chatRunId: ChatRunId,
    proceed: boolean,
  ) => void;
}
