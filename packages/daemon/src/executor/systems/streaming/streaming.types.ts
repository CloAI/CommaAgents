import type { EventSink } from "../../event-sink";
import type { Logger } from "../../logger/logger.types";
import type { RunStore } from "../../runs/runs.types";
import type { DaemonSystem } from "../systems.types";

export interface StreamingSystemOptions {
  readonly logger: Logger;
  readonly runStore: RunStore;
  readonly sink: EventSink;
}

export interface StreamingSystem extends DaemonSystem {
  readonly name: "streaming";
}

export function createStreamingSystem(
  options: StreamingSystemOptions,
): StreamingSystem;
