import { createQuestionBridge } from "../../question-bridge";
import type {
  CleanupContext,
  DaemonSystem,
  SystemRunContext,
} from "../systems.types";
import type { QuestionSystemOptions } from "./question.types";

/**
 * Creates the question system that manages question requests.
 *
 * This system:
 * - Creates and manages the QuestionBridge lifecycle
 * - Stores the questionBridge in systemData for sandbox callbacks
 * - Registers the resolveQuestion action for handling user responses
 *
 * @param options - Configuration options for the question system
 * @returns A DaemonSystem that handles question requests
 */
export function createQuestionSystem(
  options: QuestionSystemOptions = {},
): DaemonSystem {
  const { bridgeTimeout = 0 } = options;

  return {
    name: "question",

    onRunStart(runContext: SystemRunContext): void {
      const { run, sink, abortSignal, systemData, runActionRegistry } =
        runContext;

      const questionBridge = createQuestionBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: abortSignal,
      });

      systemData.set("questionBridge", questionBridge);

      runActionRegistry.register(
        "resolveQuestion",
        run.id,
        (questionRequestId: unknown, response: unknown): boolean => {
          return questionBridge.resolveQuestion(
            questionRequestId as string,
            response as string,
          );
        },
      );
    },

    onRunCleanup(cleanupContext: CleanupContext): void {
      const { run, systemData, runActionRegistry } = cleanupContext;

      const questionBridge = systemData.get("questionBridge");

      if (questionBridge) {
        questionBridge.destroy();
      }

      runActionRegistry.unregisterAll(run.id);
    },
  };
}
