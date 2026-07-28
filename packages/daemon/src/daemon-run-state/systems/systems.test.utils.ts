import { mockLogger, mockMessageSender } from "../../test.utils";
import type { SystemRunContext } from "./systems.types";
import {
  createRunActionRegistry,
  createSystemDataStore,
} from "./systems.utils";

export function createSystemRunContext(runId = "run-1"): SystemRunContext & {
  messageSender: ReturnType<typeof mockMessageSender>;
  abortController: AbortController;
} {
  const abortController = new AbortController();

  return {
    abortController,
    run: {
      id: runId,
      strategyPath: "/strategy.json",
      strategyName: "Test",
      startedAt: new Date(),
      cwd: "/workspace",
      status: "running",
    },
    messageSender: mockMessageSender(),
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
