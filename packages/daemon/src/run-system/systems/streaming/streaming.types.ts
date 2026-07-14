import type { Logger } from "../../../logger/logger.types";
import type { MessageSender } from "../../../server/protocol/dispatcher/dispatcher.types";
import type { DaemonSystem } from "../systems.types";

export interface StreamingSystemOptions {
  readonly logger: Logger;
  readonly messageSender: MessageSender;
}

export interface StreamingSystem extends DaemonSystem {
  readonly name: "streaming";
}
