import { useCallback, useContext, useEffect, useState } from "react";
import type {
  DaemonChannelMap,
  DaemonCommandMap,
} from "@comma-agents/daemon/protocol";
import { daemonLogs } from "../useLogBucket/logger";
import { CommaAgentsDaemonContext } from "./useCommaAgentsDaemon.context";
import type {
  DaemonArguments,
  DaemonChannelResult,
  DaemonCommandResult,
  DaemonOperation,
  DaemonResult,
} from "./useCommaAgentsDaemon.types";
import { prepareArguments } from "./useCommaAgentsDaemon.utils";

/**
 * Run an inferred daemon command automatically on mount and argument changes.
 * @param {{command: Name}} operation - Command name determining argument and result types.
 * @param {DaemonCommandMap[Name]["arguments"]} argumentsValue - Current typed arguments.
 * @returns {DaemonCommandResult<Name>} Current command result and progress.
 * @example
 * const { data, isLoading } = useCommaAgentsDaemon({ command: "runs.get" }, { runId });
 */
export function useCommaAgentsDaemon<Name extends keyof DaemonCommandMap>(
  operation: { readonly command: Name },
  argumentsValue: DaemonCommandMap[Name]["arguments"],
): DaemonCommandResult<Name>;
/**
 * Subscribe automatically and expose the latest typed channel event.
 * @param {{channel: Name}} operation - Channel name determining arguments and messages.
 * @param {DaemonChannelMap[Name]["arguments"]} argumentsValue - Current typed subscription arguments.
 * @returns {DaemonChannelResult<Name>} Latest channel event and acknowledgement progress.
 * @example
 * const { data, isLoading } = useCommaAgentsDaemon({ channel: "runs" }, { runId });
 */
export function useCommaAgentsDaemon<Name extends keyof DaemonChannelMap>(
  operation: { readonly channel: Name },
  argumentsValue: DaemonChannelMap[Name]["arguments"],
): DaemonChannelResult<Name>;
/**
 * Match one consumer's operation to shared request routing.
 * @param {DaemonOperation} operation - Command or channel selector.
 * @param {unknown} argumentsValue - JSON-compatible operation arguments.
 * @returns {DaemonResult<unknown>} Local operation result and progress.
 */
export function useCommaAgentsDaemon(
  operation: DaemonOperation,
  argumentsValue: unknown,
): DaemonResult<unknown> {
  const [state, setState] = useState<DaemonResult<unknown>>({
    data: undefined,
    errors: undefined,
    clientError: undefined,
    isLoading: true,
  });
  const context = useContext(CommaAgentsDaemonContext);
  if (!context)
    throw new Error(
      "useCommaAgentsDaemon must be used within CommaAgentsDaemonProvider.",
    );
  const kind = "command" in operation ? "command" : "channel";
  const name = "command" in operation ? operation.command : operation.channel;
  const prepared = prepareArguments(argumentsValue);
  const key = "key" in prepared ? prepared.key : undefined;
  const invalidReason =
    "error" in prepared ? prepared.error.message : undefined;
  const update = useCallback(
    (patch: Partial<DaemonResult<unknown>>) =>
      setState((previous) => ({ ...previous, ...patch })),
    [],
  );
  useEffect(() => {
    setState({
      data: undefined,
      errors: undefined,
      clientError: invalidReason
        ? { code: "INVALID_ARGUMENTS", message: invalidReason }
        : undefined,
      isLoading: key !== undefined,
    });
    if (key === undefined) {
      daemonLogs.error(
        invalidReason ?? "Invalid daemon arguments.",
        `${kind}: ${name}; code: INVALID_ARGUMENTS`,
      );
      return;
    }
    const start = kind === "command" ? context.command : context.subscribe;
    return start(name, JSON.parse(key) as DaemonArguments, update);
  }, [context, kind, name, key, invalidReason, update]);

  return state;
}
