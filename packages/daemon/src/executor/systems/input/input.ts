import { createInputBridge } from "../../input-bridge";
import type {
  CleanupContext,
  DaemonSystem,
  SystemRunContext,
} from "../systems.types";
import type { InputSystemOptions } from "./input.types";

/**
 * Creates the input system that manages user input collection.
 *
 * This system:
 * - Creates and manages the InputBridge lifecycle
 * - Stores the inputCollector in systemData for strategy loading
 * - Registers the resolveInput action for handling user responses
 *
 * @param options - Configuration options for the input system
 * @returns A DaemonSystem that handles input collection
 */
export function createInputSystem(
  options: InputSystemOptions = {},
): DaemonSystem {
  const { bridgeTimeout = 0 } = options;

  return {
    name: "input",

    onRunStart(runContext: SystemRunContext): void {
      const { run, sink, abortSignal, systemData, runActionRegistry } =
        runContext;

      const inputBridge = createInputBridge({
        sink,
        runId: run.id,
        timeout: bridgeTimeout,
        abort: abortSignal,
      });

      systemData.set("inputBridge", inputBridge);
      systemData.set("inputCollector", inputBridge.collector);

      runActionRegistry.register(
        "resolveInput",
        run.id,
        (agentName: unknown, text: unknown): boolean => {
          return inputBridge.resolveInput(agentName as string, text as string);
        },
      );
    },

    onRunCleanup(cleanupContext: CleanupContext): void {
      const { run, systemData, runActionRegistry } = cleanupContext;

      const inputBridge = systemData.get("inputBridge");

      if (inputBridge) {
        inputBridge.destroy();
      }

      runActionRegistry.unregisterAll(run.id);
    },
  };
}
