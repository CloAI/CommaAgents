import {
  createContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { ServerMessageSchema } from "@comma-agents/daemon/protocol";
import type {
  PluginClientMessage,
  PluginServerMessage,
} from "@comma-agents/daemon/protocol";
import { daemonLogs } from "../useLogBucket/logger";
import { useSettings } from "../useSettings";
import { useWebSocket } from "../useWebSocket";
import type { WebSocketStatus } from "../useWebSocket";
import type {
  DaemonArguments,
  DaemonClientError,
  DaemonContextValue,
  DaemonListener,
  DaemonRequest,
} from "./useCommaAgentsDaemon.types";

export const CommaAgentsDaemonContext =
  createContext<DaemonContextValue | null>(null);

/** Connection observers stay separate so status changes do not restart requests. */
export const DaemonConnectionStatusContext =
  createContext<WebSocketStatus | null>(null);

/** Application content sharing one daemon connection. */
export interface CommaAgentsDaemonProviderProps {
  /** Components that can execute commands and subscribe to channels. */
  readonly children: ReactNode;
}

/**
 * Route daemon responses by request ID over a settings-owned shared connection.
 * @param {CommaAgentsDaemonProviderProps} props - Application content.
 * @returns {React.ReactElement} The shared daemon request context.
 */
export function CommaAgentsDaemonProvider({
  children,
}: CommaAgentsDaemonProviderProps) {
  const { settings } = useSettings();
  const endpoint = settings.daemon.url;
  const previousEndpoint = useRef<string | null>(null);
  const registry = useRef(new Map<string, DaemonRequest>());
  const connected = useRef(false);
  const send = useRef<(data: string) => boolean>(() => false);

  const release = useCallback((request: DaemonRequest, unsubscribe = false) => {
    window.clearTimeout(request.timer);
    registry.current.delete(request.id);
    if (unsubscribe && request.kind === "channel" && request.sent) {
      send.current(
        JSON.stringify({ type: "unsubscribe", requestId: request.id }),
      );
    }
  }, []);

  // TODO: Fail Locally? What is this? I have not heard of this kinda error handling...
  const failLocally = useCallback(
    (request: DaemonRequest, error: DaemonClientError) => {
      if (error.code === "TIMEOUT") {
        daemonLogs.error(
          error.message,
          `${request.kind}: ${request.name}; requestId: ${request.id}; code: ${error.code}`,
        );
      }
      release(request, true);
      request.listener({
        isLoading: false,
        errors: undefined,
        clientError: error,
      });
    },
    [release],
  );

  const transmit = useCallback(
    (request: DaemonRequest) => {
      //AI: We should not have special timeouts per "request type"...
      const timeoutMs =
        request.name === "core.providers.refresh" ? 30_000 : 10_000;
      request.sent = true;
      request.listener({
        isLoading: true,
        errors: undefined,
        clientError: undefined,
      });
      request.timer = window.setTimeout(() => {
        if (
          registry.current.get(request.id) === request
        ) // TODO: I don't think we really need to handle this timeout? Also, we need to clear it when we get a response...
        {
          failLocally(request, {
            code: "TIMEOUT",
            message:
              request.kind === "command"
                ? request.name === "core.providers.refresh"
                  ? "The daemon did not refresh models within thirty seconds. The command may still complete on the server."
                  : "The daemon did not respond within ten seconds. The command may still complete on the server."
                : "The daemon did not acknowledge the subscription within ten seconds.",
          });
        }
      }, timeoutMs);
      const message: PluginClientMessage =
        request.kind === "command"
          ? {
              type: "command",
              requestId: request.id,
              command: request.name,
              arguments: request.arguments,
            }
          : {
              type: "subscribe",
              requestId: request.id,
              channel: request.name,
              arguments: request.arguments,
            };
      send.current(JSON.stringify(message));
    },
    [failLocally],
  );

  const handleMessage = useCallback(
    (raw: unknown) => {
      let message: PluginServerMessage;
      try {
        if (typeof raw !== "string") {
          throw new Error("Expected a text frame.");
        }
        message = ServerMessageSchema.parse(JSON.parse(raw));
      } catch {
        daemonLogs.error(
          "The daemon sent an invalid protocol message.",
          "code: INVALID_MESSAGE",
        );
        for (const request of [...registry.current.values()]) {
          failLocally(request, {
            code: "INVALID_MESSAGE",
            message: "The daemon sent an invalid protocol message.",
          });
        }
        return;
      }
      const request = registry.current.get(message.requestId);
      if (!request) {
        return;
      }
      if (message.type === "response" && "ok" in message) {
        window.clearTimeout(request.timer);
        if (!message.ok) {
          daemonLogs.error(
            message.error.message,
            `${request.kind}: ${request.name}; requestId: ${request.id}; code: ${message.error.code}`,
          );
        }
        if (!message.ok || request.kind === "command") {
          release(request);
        }
        request.listener({
          isLoading: false,
          errors: message.ok ? undefined : message.error,
          clientError: undefined,
          ...(message.ok && request.kind === "command"
            ? { data: message.data }
            : {}),
        });
      } else if (message.type === "subscription_end" && "reason" in message) {
        release(request);
        if (message.reason === "failed") {
          daemonLogs.error(
            message.error.message,
            `channel: ${request.name}; requestId: ${request.id}; code: ${message.error.code}`,
          );
        }
        request.listener({
          isLoading: false,
          errors: message.reason === "failed" ? message.error : undefined,
          clientError: undefined,
        });
      } else if (request.kind === "channel" && "data" in message) {
        request.listener({
          data: { type: message.type, data: message.data },
          isLoading: false,
          errors: undefined,
          clientError: undefined,
        });
      }
    },
    [failLocally, release],
  );

  const handleStatus = useCallback(
    (nextStatus: WebSocketStatus, error?: Error) => {
      connected.current = nextStatus === "connected";
      if (connected.current) {
        daemonLogs.info("Daemon connected.");
        for (const request of [...registry.current.values()]) {
          if (!connected.current) {
            break;
          }
          if (request.sent) {
            continue;
          }
          registry.current.delete(request.id);
          request.id = crypto.randomUUID();
          registry.current.set(request.id, request);
          transmit(request);
        }
        return;
      }
      if (error) {
        const url = new URL(endpoint);
        const address = `${url.protocol}//${url.host}${url.pathname}`;
        daemonLogs.warn(error.message.replaceAll(endpoint, address));
      }
      for (const request of [...registry.current.values()]) {
        window.clearTimeout(request.timer);
        if (request.kind === "command") {
          if (!request.sent) {
            continue;
          }
          failLocally(request, {
            code: "CONNECTION_LOST",
            message:
              "The connection closed before a response arrived. The command may still complete on the daemon and was not replayed.",
          });
        } else {
          request.sent = false;
          request.listener({
            isLoading: true,
            errors: undefined,
            clientError: error
              ? { code: "CONNECTION_LOST", message: error.message }
              : undefined,
          });
        }
      }
    },
    [endpoint, failLocally, transmit],
  );

  const socket = useWebSocket({
    url: endpoint,
    onMessage: handleMessage,
    onStatus: handleStatus,
  });
  useLayoutEffect(() => {
    send.current = socket.send;
  }, [socket.send]);

  useLayoutEffect(() => {
    const requests = registry.current;
    const url = new URL(endpoint);
    daemonLogs.info(
      previousEndpoint.current !== null && previousEndpoint.current !== endpoint
        ? "Daemon endpoint changed. Connecting to daemon."
        : "Connecting to daemon.",
      `${url.protocol}//${url.host}${url.pathname}`,
    );
    previousEndpoint.current = endpoint;
    connected.current = false;
    return () => {
      connected.current = false;
      for (const request of [...requests.values()]) {
        release(request, true);
      }
    };
  }, [endpoint, release]);

  const start = useCallback(
    (
      kind: "command" | "channel",
      name: string,
      argumentsValue: DaemonArguments,
      listener: DaemonListener,
    ) => {
      const request: DaemonRequest = {
        id: crypto.randomUUID(),
        kind,
        name,
        arguments: argumentsValue,
        listener,
        sent: false,
      };
      registry.current.set(request.id, request);
      if (connected.current) {
        transmit(request);
      }
      return () => {
        if (registry.current.get(request.id) === request) {
          release(request, true);
        }
      };
    },
    [release, transmit],
  );

  const command = useCallback(
    (name: string, argumentsValue: DaemonArguments, listener: DaemonListener) =>
      start("command", name, argumentsValue, listener),
    [start],
  );
  const subscribe = useCallback(
    (name: string, argumentsValue: DaemonArguments, listener: DaemonListener) =>
      start("channel", name, argumentsValue, listener),
    [start],
  );
  const value = useMemo<DaemonContextValue>(
    () => ({ endpoint, command, subscribe }),
    [endpoint, command, subscribe],
  );
  return (
    <DaemonConnectionStatusContext.Provider value={socket.status}>
      <CommaAgentsDaemonContext.Provider value={value}>
        {children}
      </CommaAgentsDaemonContext.Provider>
    </DaemonConnectionStatusContext.Provider>
  );
}
