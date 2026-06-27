import type { ClientMessage, DaemonMessage } from "@comma-agents/daemon";
import { parseClientMessage } from "@comma-agents/daemon";
import type { Server, ServerWebSocket } from "bun";

interface MockDaemonWebSocketData {
  readonly clientId: string;
}

type MockDaemonSocket = ServerWebSocket<MockDaemonWebSocketData>;
type ProviderInfo = Extract<
  DaemonMessage,
  { type: "provider_list" }
>["providers"][number];
type McpServerStatus = Extract<
  DaemonMessage,
  { type: "mcp_server_list" }
>["servers"][number];
type RunOverview = Extract<DaemonMessage, { type: "run_list" }>["runs"][number];

interface PendingClientMessageWaiter {
  readonly type: ClientMessage["type"];
  readonly resolve: (message: ClientMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export interface MockDaemonScenarioContext {
  readonly runId: string;
  readonly input: string;
  readonly requestId?: string;
  readonly strategyName: string;
  readonly agentName: string;
  readonly send: (message: DaemonMessage) => void;
  readonly base: (requestId: string | undefined) => {
    readonly ts: string;
    readonly requestId?: string;
  };
}

export type MockDaemonScenario = (
  context: MockDaemonScenarioContext,
) => void | Promise<void>;

export interface MockDaemonOptions {
  readonly strategyName?: string;
  readonly agentName?: string;
  readonly responseText?: (input: string) => string;
  readonly providers?: readonly ProviderInfo[];
  readonly mcpServers?: readonly McpServerStatus[];
  readonly runs?: readonly RunOverview[];
  readonly scenario?: MockDaemonScenario;
}

export interface MockDaemon {
  readonly url: string;
  readonly receivedMessages: readonly ClientMessage[];
  readonly sentMessages: readonly DaemonMessage[];
  waitForClientMessage<MessageKind extends ClientMessage["type"]>(
    type: MessageKind,
    timeoutMs?: number,
  ): Promise<Extract<ClientMessage, { type: MessageKind }>>;
  stop(): void;
}

export function startMockDaemon({
  strategyName = "tui-e2e-strategy",
  agentName = "echo",
  responseText = (input) => `Mock daemon response for: ${input}`,
  providers = [],
  mcpServers = [],
  runs = [],
  scenario,
}: MockDaemonOptions = {}): MockDaemon {
  const receivedMessages: ClientMessage[] = [];
  const sentMessages: DaemonMessage[] = [];
  const waiters: PendingClientMessageWaiter[] = [];
  const nextUnreadIndexByType = new Map<ClientMessage["type"], number>();
  const sockets = new Set<MockDaemonSocket>();
  let currentMcpServers = [...mcpServers];
  let server: Server<MockDaemonWebSocketData>;

  function base(requestId: string | undefined): {
    readonly ts: string;
    readonly requestId?: string;
  } {
    return {
      ts: new Date().toISOString(),
      ...(requestId !== undefined ? { requestId } : {}),
    };
  }

  function send(websocket: MockDaemonSocket, message: DaemonMessage): void {
    sentMessages.push(message);
    websocket.send(JSON.stringify(message));
  }

  function sendError(
    websocket: MockDaemonSocket,
    code: string,
    message: string,
    requestId?: string,
  ): void {
    send(websocket, {
      type: "error",
      code,
      message,
      ...base(requestId),
    });
  }

  function resolveWaiter(message: ClientMessage): void {
    const waiterIndex = waiters.findIndex(
      (waiter) => waiter.type === message.type,
    );
    if (waiterIndex < 0) return;

    const [waiter] = waiters.splice(waiterIndex, 1);
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    waiter.resolve(message);
  }

  function sendMcpServerList(
    websocket: MockDaemonSocket,
    requestId: string | undefined,
  ): void {
    send(websocket, {
      type: "mcp_server_list",
      servers: currentMcpServers,
      ...base(requestId),
    });
  }

  async function handleClientMessage(
    websocket: MockDaemonSocket,
    message: ClientMessage,
  ): Promise<void> {
    receivedMessages.push(message);
    resolveWaiter(message);

    if (message.type === "list_mcp_servers") {
      sendMcpServerList(websocket, message.requestId);
      return;
    }

    if (message.type === "update_mcp_server") {
      currentMcpServers = currentMcpServers.map((serverStatus) =>
        serverStatus.id === message.serverId
          ? { ...serverStatus, enabled: message.enabled }
          : serverStatus,
      );
      sendMcpServerList(websocket, message.requestId);
      return;
    }

    if (message.type === "list_providers") {
      send(websocket, {
        type: "provider_list",
        providers,
        ...base(message.requestId),
      });
      return;
    }

    if (message.type === "list_runs") {
      send(websocket, {
        type: "run_list",
        runs,
        ...base(message.requestId),
      });
      return;
    }

    if (message.type === "ping") {
      send(websocket, {
        type: "pong",
        ...base(message.requestId),
      });
      return;
    }

    if (message.type === "subscribe" || message.type === "unsubscribe") {
      return;
    }

    if (message.type === "prepare_run") {
      const runId = message.runId ?? crypto.randomUUID();
      send(websocket, {
        type: "run_prepared",
        runId,
        strategyName,
        agents: [agentName],
        flowTree: {
          type: "sequential",
          name: "main",
          steps: [{ agent: agentName }],
        },
        conversation: { records: [], retentionEvents: [], inputs: [] },
        mcpServers: currentMcpServers,
        ...base(message.requestId),
      });
      return;
    }

    if (message.type === "start_run") {
      const scenarioContext: MockDaemonScenarioContext = {
        runId: message.runId,
        input: message.input ?? "",
        requestId: message.requestId,
        strategyName,
        agentName,
        send: (daemonMessage) => send(websocket, daemonMessage),
        base,
      };
      await Bun.sleep(25);
      if (scenario) {
        await scenario(scenarioContext);
      } else {
        await createSimpleSuccessScenario({ responseText })(scenarioContext);
      }
    }
  }

  server = Bun.serve<MockDaemonWebSocketData>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, fetchServer) {
      const url = new URL(request.url);
      if (url.pathname !== "/ws") {
        return new Response("Not Found", { status: 404 });
      }

      const upgraded = fetchServer.upgrade(request, {
        data: { clientId: crypto.randomUUID() },
      });
      return upgraded
        ? undefined
        : new Response("WebSocket upgrade failed", { status: 400 });
    },
    websocket: {
      open(websocket) {
        sockets.add(websocket);
      },
      message(websocket, rawMessage) {
        try {
          const parsedJson = JSON.parse(String(rawMessage)) as unknown;
          const result = parseClientMessage(parsedJson);
          if (!result.success) {
            sendError(
              websocket,
              "INVALID_REQUEST",
              result.error.issues.map((issue) => issue.message).join("; "),
            );
            return;
          }

          void handleClientMessage(websocket, result.data).catch((error) => {
            sendError(
              websocket,
              "SCENARIO_ERROR",
              error instanceof Error ? error.message : String(error),
              "requestId" in result.data ? result.data.requestId : undefined,
            );
          });
        } catch (error) {
          sendError(
            websocket,
            "INVALID_JSON",
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      close(websocket) {
        sockets.delete(websocket);
      },
    },
  });

  return {
    url: `ws://127.0.0.1:${server.port}/ws`,
    receivedMessages,
    sentMessages,
    waitForClientMessage<MessageKind extends ClientMessage["type"]>(
      type: MessageKind,
      timeoutMs = 5_000,
    ): Promise<Extract<ClientMessage, { type: MessageKind }>> {
      const startIndex = nextUnreadIndexByType.get(type) ?? 0;
      const existingIndex = receivedMessages.findIndex(
        (message, index) => index >= startIndex && message.type === type,
      );
      if (existingIndex >= 0) {
        nextUnreadIndexByType.set(type, existingIndex + 1);
        return Promise.resolve(
          receivedMessages[existingIndex] as Extract<
            ClientMessage,
            { type: MessageKind }
          >,
        );
      }

      return new Promise<Extract<ClientMessage, { type: MessageKind }>>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            const waiterIndex = waiters.findIndex(
              (waiter) => waiter.resolve === resolve,
            );
            if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
            reject(
              new Error(
                `Timed out waiting for client message ${type}; received: ${receivedMessages.map((message) => message.type).join(", ")}`,
              ),
            );
          }, timeoutMs);

          waiters.push({
            type,
            resolve: (message) =>
              resolve(message as Extract<ClientMessage, { type: MessageKind }>),
            reject,
            timeout,
          });
        },
      );
    },
    stop(): void {
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("Mock daemon stopped"));
      }
      for (const socket of sockets) {
        socket.close(1001, "Mock daemon stopped");
      }
      sockets.clear();
      server.stop(true);
    },
  };
}

export function createSimpleSuccessScenario({
  responseText = (input: string) => `Mock daemon response for: ${input}`,
}: {
  readonly responseText?: (input: string) => string;
} = {}): MockDaemonScenario {
  return ({ runId, input, requestId, strategyName, agentName, send, base }) => {
    const text = responseText(input);
    const usage = { promptTokens: 11, completionTokens: 7 };
    const contextUsage = {
      totalTokens: 18,
      inputTokens: 11,
      outputTokens: 7,
    };

    send({
      type: "strategy_started",
      runId,
      strategyName,
      agents: [agentName],
      flowTree: {
        type: "sequential",
        name: "main",
        steps: [{ agent: agentName }],
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: { type: "text", text },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: {
        type: "done",
        result: { text, usage, contextUsage, finishReason: "stop" },
      },
      ...base(requestId),
    });
    send({
      type: "strategy_completed",
      runId,
      result: text,
      usage,
      ...base(requestId),
    });
  };
}

export function createToolInfoScenario(): MockDaemonScenario {
  return ({ runId, requestId, strategyName, agentName, send, base }) => {
    const usage = { promptTokens: 42, completionTokens: 18 };
    const contextUsage = {
      totalTokens: 33_000,
      inputTokens: 31_200,
      outputTokens: 1_800,
      inputTokenDetails: { noCacheTokens: 26_000, cacheReadTokens: 5_200 },
      outputTokenDetails: { textTokens: 1_200, reasoningTokens: 600 },
    };

    send({
      type: "strategy_started",
      runId,
      strategyName,
      agents: [agentName],
      flowTree: {
        type: "sequential",
        name: "main",
        steps: [{ agent: agentName }],
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: { type: "thinking-start", id: "thinking-1" },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: {
        type: "thinking",
        id: "thinking-1",
        text: "Inspecting the workspace before reading package metadata.",
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: { type: "thinking-end", id: "thinking-1" },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: {
        type: "tool-call",
        toolCallId: "tool-read-package",
        toolName: "read_file",
        args: JSON.stringify({ path: "package.json" }),
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: {
        type: "tool-result",
        toolCallId: "tool-read-package",
        toolName: "read_file",
        output: '{\n  "name": "comma-agents"\n}\n',
        status: "completed",
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: { type: "text", text: "Package metadata inspected." },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      contextWindow: 128_000,
      event: {
        type: "done",
        result: {
          text: "Package metadata inspected.",
          usage,
          contextUsage,
          finishReason: "stop",
        },
      },
      ...base(requestId),
    });
    send({
      type: "strategy_completed",
      runId,
      result: "Package metadata inspected.",
      usage,
      ...base(requestId),
    });
  };
}

export function createSpawnedStrategyScenario(): MockDaemonScenario {
  return ({ runId, requestId, strategyName, agentName, send, base }) => {
    const usage = { promptTokens: 21, completionTokens: 13 };

    send({
      type: "strategy_started",
      runId,
      strategyName,
      agents: [agentName, "child"],
      flowTree: {
        type: "sequential",
        name: "main",
        steps: [{ agent: agentName }],
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      event: {
        type: "tool-call",
        toolCallId: "launch-child",
        toolName: "launch_strategy",
        args: JSON.stringify({
          name: "Child Strategy",
          input: "Investigate nested output",
          modelOverride: "mock/child",
        }),
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName: "child",
      model: "mock/child",
      event: { type: "text", text: "Child strategy produced nested details." },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName: "child",
      model: "mock/child",
      event: {
        type: "done",
        result: {
          text: "Child strategy produced nested details.",
          usage,
          finishReason: "stop",
        },
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      event: {
        type: "tool-result",
        toolCallId: "launch-child",
        toolName: "launch_strategy",
        output: JSON.stringify({
          data: {
            path: "@comma/test/child",
            finishReason: "stop",
            result: "Child strategy produced nested details.",
          },
        }),
        status: "completed",
      },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      event: { type: "text", text: "Parent observed the spawned result." },
      ...base(requestId),
    });
    send({
      type: "agent_streaming",
      runId,
      agentName,
      model: "mock/model",
      event: {
        type: "done",
        result: {
          text: "Parent observed the spawned result.",
          usage,
          finishReason: "stop",
        },
      },
      ...base(requestId),
    });
    send({
      type: "strategy_completed",
      runId,
      result: "Parent observed the spawned result.",
      usage,
      ...base(requestId),
    });
  };
}
