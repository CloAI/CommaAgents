// hookIntoFlow — Append hooks to an existing flow agent.
//
// Mutates the flow's internal hook store via appendHook (provided by
// buildFlowAgent). Returns the same agent reference for chaining.

import type { Agent } from "../../agents/agent/agent.types";
import type { FlowHooks } from "../flow/flow.types";

// hookIntoFlow

/**
 * Append hooks to an existing flow agent. Mutates the flow in-place and
 * returns the same reference for chaining.
 *
 * The flow must have been created by one of the flow factories
 * (`createSequentialFlow`, `createCycleFlow`, `createBroadcastFlow`,
 * `createFlow`, or `buildFlowAgent`), which provide the internal
 * `appendHook` method. Throws if the flow doesn't support it.
 *
 * The generic parameter `H` allows passing extended hook types
 * (e.g. `CycleHooks`) for cycle-specific hooks:
 *
 * @example
 * ```ts
 * // Basic flow hooks
 * const flow = createSequentialFlow({ name: "pipe", steps: [a, b] });
 * hookIntoFlow(flow, {
 *   beforeFlow: [async (msg) => console.log("starting:", msg)],
 *   afterFlow: [async (msg) => console.log("done:", msg)],
 * });
 *
 * // Cycle-specific hooks
 * const cycle = createCycleFlow({ name: "loop", steps: [a], cycles: 3 });
 * hookIntoFlow<CycleHooks>(cycle, {
 *   alterMessageBeforeCycle: [async (msg) => `[cycle]${msg}`],
 * });
 *
 * // Chaining
 * hookIntoFlow(
 *   hookIntoFlow(flow, { beforeFlow: [logger] }),
 *   { afterFlow: [cleanup] },
 * );
 * ```
 */
export function hookIntoFlow<H extends FlowHooks = FlowHooks>(flow: Agent, hooks: H): Agent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- appendHook is an implementation detail, not on the interface
  const appendHook = (flow as any).appendHook as
    | ((hookName: string, callback: unknown) => void)
    | undefined;

  if (!appendHook) {
    throw new Error(
      `hookIntoFlow requires a flow created by a flow factory. ` +
        `Agent "${flow.name}" does not support appendHook.`,
    );
  }

  for (const [name, callbacks] of Object.entries(hooks)) {
    if (callbacks) {
      for (const cb of callbacks as readonly unknown[]) {
        appendHook(name, cb);
      }
    }
  }

  return flow;
}
