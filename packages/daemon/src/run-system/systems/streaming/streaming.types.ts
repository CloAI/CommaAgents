import type { Logger } from "../../../logger/logger.types";
import type { EventSink } from "../../event-sink";
import type { DaemonSystem } from "../systems.types";

export interface StreamingSystemOptions {
  readonly logger: Logger;
  readonly sink: EventSink;
}

export interface StreamingSystem extends DaemonSystem {
  readonly name: "streaming";
}
