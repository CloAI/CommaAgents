import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";
import { CommaAgentsDaemonContext } from "../useCommaAgentsDaemon/useCommaAgentsDaemon.context";
import { prepareArguments } from "../useCommaAgentsDaemon/useCommaAgentsDaemon.utils";
import { useDaemonConnectionStatus } from "../useCommaAgentsDaemon";
import type { DaemonArguments } from "../useCommaAgentsDaemon/useCommaAgentsDaemon.types";
import type {
  DaemonClientError,
  DaemonCommandResult,
} from "../useCommaAgentsDaemon";
import type {
  DaemonFailure,
  DaemonMutationResult,
} from "./useDaemonMutation.types";

/**
 * Submit a typed command on an explicit user action through the shared socket.
 * @param {Name} command - Command determining argument and result types.
 * @returns {DaemonMutationResult<Name>} Request state and a non-replaying submission function.
 * @example const { mutate, isLoading } = useDaemonMutation("core.providers.configure");
 */
export function useDaemonMutation<Name extends keyof DaemonCommandMap>(
  command: Name,
): DaemonMutationResult<Name> {
  const context = useContext(CommaAgentsDaemonContext);
  if (!context) {
    throw new Error(
      "useDaemonMutation must be used within CommaAgentsDaemonProvider.",
    );
  }
  const status = useDaemonConnectionStatus();
  const [state, setState] = useState<DaemonCommandResult<Name>>({
    data: undefined,
    errors: undefined,
    clientError: undefined,
    isLoading: false,
  });
  const pending = useRef<{
    dispose: () => void;
    reject: (error: DaemonClientError) => void;
  } | null>(null);

  const owner = useRef<{ context: typeof context; command: Name } | null>({
    context,
    command,
  });
  useEffect(() => {
    owner.current = { context, command };
    setState({
      data: undefined,
      errors: undefined,
      clientError: undefined,
      isLoading: false,
    });
    return () => {
      owner.current = null;
      const active = pending.current;
      pending.current = null;
      if (active) {
        active.dispose();
        active.reject({
          code: "CONNECTION_LOST",
          message:
            "The request was cancelled. It may still complete on the daemon.",
        });
      }
    };
  }, [context, command]);

  const mutate = useCallback(
    (
      args: DaemonCommandMap[Name]["arguments"],
    ): Promise<DaemonCommandMap[Name]["result"]> => {
      if (
        owner.current?.context !== context ||
        owner.current.command !== command
      ) {
        return Promise.reject({
          code: "CONNECTION_LOST",
          message:
            "The request was cancelled. It may still complete on the daemon.",
        });
      }
      if (pending.current) {
        return Promise.reject({
          code: "INVALID_ARGUMENTS",
          message: "A command is already pending.",
        });
      }
      const prepared = prepareArguments(args);
      const error: DaemonClientError | undefined =
        "error" in prepared
          ? prepared.error
          : status !== "connected"
            ? {
                code: "CONNECTION_LOST",
                message: "Connect to the daemon before saving changes.",
              }
            : undefined;
      if (error) {
        setState({
          data: undefined,
          errors: undefined,
          clientError: error,
          isLoading: false,
        });
        return Promise.reject(error);
      }
      setState({
        data: undefined,
        errors: undefined,
        clientError: undefined,
        isLoading: true,
      });
      return new Promise((resolve, reject) => {
        const active = { dispose: () => {}, reject };
        pending.current = active;
        active.dispose = context.command(
          command,
          JSON.parse((prepared as { key: string }).key) as DaemonArguments,
          (update) => {
            if (pending.current !== active || update.isLoading !== false) {
              return;
            }
            pending.current = null;
            active.dispose();
            const failure = update.errors ?? update.clientError;
            const data = update.data as DaemonCommandMap[Name]["result"];
            setState({
              data: failure ? undefined : data,
              errors: update.errors,
              clientError: update.clientError,
              isLoading: false,
            });
            if (failure) {
              reject(failure);
            } else {
              resolve(data);
            }
          },
        );
      });
    },
    [context, command, status],
  );
  const attempt = useCallback(
    (args: DaemonCommandMap[Name]["arguments"]) =>
      mutate(args).then(
        (data) => ({ ok: true as const, data }),
        // Every rejection above is a daemon or client failure.
        (error: DaemonFailure) => ({ ok: false as const, error }),
      ),
    [mutate],
  );
  return { ...state, mutate, attempt };
}
