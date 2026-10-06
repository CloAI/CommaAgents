import type { MessageSender } from "../../../server/protocol/dispatcher/dispatcher.types";
import type { DaemonSystem } from "../systems.types";

export interface StreamingSystemOptions {
  readonly messageSender: MessageSender;
}

export interface StreamingSystem extends DaemonSystem {
  readonly name: "streaming";
}
