import type { RunSnapshot } from "../state.types";
import type { ConversationEvent } from "../../conversation/conversation.types";
/** @internal Durable run metadata and execution conversation, owned by one run. */
export interface RunStorage {
  save(snapshot: RunSnapshot): Promise<void>;
  read(runId: string): Promise<RunSnapshot | undefined>;
  append(runId: string, event: ConversationEvent): Promise<void>;
  conversation(runId: string): Promise<readonly ConversationEvent[]>;
}
