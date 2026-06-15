import { mockLogger, mockSink } from "../../test.utils";
import type { SystemRunContext } from "./systems.types";
import {
  createRunActionRegistry,
  createSystemDataStore,
} from "./systems.utils";

export function createSystemRunContext(runId = "run-1"): SystemRunContext & {
  sink: ReturnType<typeof mockSink>;
} {
  const abortController = new AbortController();

  return {
    run: {
      id: runId,
      strategyPath: "/strategy.json",
      strategyName: "Test",
      startedAt: new Date(),
      abortController,
      cwd: "/workspace",
      status: "running",
    },
    sink: mockSink(),
    logger: mockLogger(),
    clientId: "client-1",
    modelOverride: undefined,
    abortSignal: abortController.signal,
    systemData: createSystemDataStore(),
    actions: createRunActionRegistry(),
    strategyPath: "/strategy.json",
    cwd: "/workspace",
    manifestPath: undefined,
  };
}
