import type { ChatRunId } from "../useChat.types";

export interface ChatInputRequestResult {
  readonly sendInput: (chatRunId: ChatRunId, text: string) => void;
}
