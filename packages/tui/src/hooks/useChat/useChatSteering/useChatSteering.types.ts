import type { ChatRunId } from "../useChat.types";

export interface ChatSteeringResult {
  readonly sendSteer: (chatRunId: ChatRunId, text: string) => void;
}
