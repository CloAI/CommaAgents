import { useContext, useEffect, useRef } from "react";
import type {
  DaemonChannelMap,
  DaemonRequestError,
} from "@comma-agents/daemon/protocol";
import { CommaAgentsDaemonContext } from "../useCommaAgentsDaemon/useCommaAgentsDaemon.context";
import type {
  DaemonArguments,
  DaemonClientError,
} from "../useCommaAgentsDaemon/useCommaAgentsDaemon.types";
import { prepareArguments } from "../useCommaAgentsDaemon/useCommaAgentsDaemon.utils";
import { daemonLogs } from "../useLogBucket/logger";

/**
 * Receive every message of a channel, in order, while its arguments are defined.
 * Unlike the latest-value channel hook, no message is skipped when several arrive together.
 * @param {Name} channel - Channel name determining argument and message types.
 * @param {DaemonChannelMap[Name]["arguments"] | undefined} argumentsValue - Subscription arguments; undefined keeps it closed.
 * @param {(message: DaemonChannelMap[Name]["message"]) => void} onMessage - Called once per message.
 * @param {(error: DaemonRequestError | DaemonClientError) => void} [onError] - Called when the daemon rejects the subscription or the connection fails.
 * @returns {void} Nothing; the subscription follows the component's lifetime.
 * @example
 * useDaemonChannel("runs", runId ? { runId } : undefined, handleMessage);
 */
export function useDaemonChannel<Name extends keyof DaemonChannelMap>(
  channel: Name,
  argumentsValue: DaemonChannelMap[Name]["arguments"] | undefined,
  onMessage: (message: DaemonChannelMap[Name]["message"]) => void,
  onError?: (error: DaemonRequestError | DaemonClientError) => void,
): void;
/**
 * Match one consumer's subscription to shared request routing.
 * @param {string} channel - Channel name.
 * @param {unknown} argumentsValue - JSON-compatible subscription arguments, or undefined.
 * @param {(message: unknown) => void} onMessage - Receives each channel message.
 * @param {(error: DaemonRequestError | DaemonClientError) => void} [onError] - Receives subscription failures.
 * @returns {void} Nothing.
 */
export function useDaemonChannel(
  channel: string,
  argumentsValue: unknown,
  onMessage: (message: unknown) => void,
  onError?: (error: DaemonRequestError | DaemonClientError) => void,
): void {
  const context = useContext(CommaAgentsDaemonContext);
  if (!context) {
    throw new Error(
      "useDaemonChannel must be used within CommaAgentsDaemonProvider.",
    );
  }
  const handler = useRef(onMessage);
  const failure = useRef(onError);
  useEffect(() => {
    handler.current = onMessage;
    failure.current = onError;
  });
  const prepared =
    argumentsValue === undefined ? undefined : prepareArguments(argumentsValue);
  const key = prepared && "key" in prepared ? prepared.key : undefined;
  const invalid =
    prepared && "error" in prepared ? prepared.error.message : undefined;
  useEffect(() => {
    if (invalid !== undefined) {
      daemonLogs.error(invalid, `channel: ${channel}; code: INVALID_ARGUMENTS`);
    }
  }, [channel, invalid]);
  useEffect(() => {
    if (key === undefined) {
      return;
    }
    return context.subscribe(
      channel,
      JSON.parse(key) as DaemonArguments,
      (patch) => {
        if (patch.data !== undefined) {
          handler.current(patch.data);
        }
        if (patch.errors) {
          failure.current?.(patch.errors);
        }
        if (patch.clientError) {
          failure.current?.(patch.clientError);
        }
      },
    );
  }, [context, channel, key]);
}
