import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DaemonMessage } from "@comma-agents/daemon";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { useContext } from "react";
import {
  CommandPaletteContextProvider,
  useCommandPalette,
} from "../components/CommandPalette/useCommandPalette";
import {
  MouseContext,
  type MouseContextValue,
  MouseProvider,
} from "../components/MouseProvider";
import { useTheme } from "../Theme";
import { darkTheme } from "../Theme/themes/dark";
import { lightTheme } from "../Theme/themes/light";
import { ThemeContextProvider } from "../Theme/useTheme/useTheme.context";
import { ChatRunsContextProvider } from "./useChat/useChat.context";
import { createInitialChatRun } from "./useChat/useChat.utils";
import { useChatActions } from "./useChat/useChatActions";
import { useChatPermissionRequests } from "./useChat/useChatPermissionRequests";
import { useChatQuestionRequests } from "./useChat/useChatQuestionRequests";
import { useChatRunStore } from "./useChat/useChatRunStore";
import { useChatSteering } from "./useChat/useChatSteering";
import { usePersistedRunList } from "./useChat/usePersistedRunList";
import type { DaemonContextValue } from "./useDaemon";
import { useDaemon } from "./useDaemon/useDaemon";
import { DaemonContext } from "./useDaemon/useDaemon.context";
import type {
  DaemonMessageListener,
  DaemonMessageType,
} from "./useDaemon/useDaemon.types";
import { McpContextProvider, useMcp } from "./useMcp";
import type { McpContextType } from "./useMcp/useMcp.types";
import { ModalContextProvider, useModal } from "./useModal";
import type { ModalControls } from "./useModal/useModal.types";
import {
  StrategyDiscoveryContextProvider,
  useDiscoveredStrategies,
  useRefreshDiscoveredStrategies,
  useStrategyDiscoveryStatus,
} from "./useStrategies";
import { UserConfigContextProvider, useUserConfig } from "./useUserConfig";
import type { UserConfigContextType } from "./useUserConfig/useUserConfig.types";

const tempDirs: string[] = [];

async function waitFor(predicate: () => boolean, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${timeoutMs}ms`);
    }
    await Bun.sleep(5);
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("context providers", () => {
  it("provides and persists user configuration updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "comma-context-config-"));
    tempDirs.push(directory);
    const configFilePath = join(directory, "config.json");
    let current: UserConfigContextType | undefined;

    function Probe() {
      current = useUserConfig();
      return <Text>{current.config.themeName}</Text>;
    }

    const { lastFrame } = render(
      <UserConfigContextProvider configFilePath={configFilePath}>
        <Probe />
      </UserConfigContextProvider>,
    );

    expect(lastFrame()).toBe("dark");
    current?.updateConfig({ themeName: "light" });
    await Bun.sleep(0);
    expect(lastFrame()).toBe("light");
    expect(JSON.parse(await Bun.file(configFilePath).text())).toEqual({
      themeName: "light",
    });
  });

  it("resolves explicit and configured themes", () => {
    const values: string[] = [];

    function Probe() {
      values.push(useTheme().colors.background);
      return null;
    }

    render(
      <UserConfigContextProvider configFilePath="/dev/null">
        <ThemeContextProvider theme={lightTheme}>
          <Probe />
        </ThemeContextProvider>
      </UserConfigContextProvider>,
    );

    expect(values.at(-1)).toBe(lightTheme.colors.background);
    expect(values.at(-1)).not.toBe(darkTheme.colors.background);
  });

  it("provides command-palette controls", () => {
    let closePalette: (() => void) | undefined;
    let closed = false;

    function Probe() {
      closePalette = useCommandPalette().closePalette;
      return null;
    }

    render(
      <CommandPaletteContextProvider
        closePalette={() => {
          closed = true;
        }}
      >
        <Probe />
      </CommandPaletteContextProvider>,
    );

    closePalette?.();
    expect(closed).toBe(true);
  });

  it("provides daemon values without redeclaring the wire contract", () => {
    const daemon = createDaemonValue();
    let current: DaemonContextValue | undefined;

    function Probe() {
      current = useDaemon();
      return null;
    }

    render(
      <DaemonContext.Provider value={daemon}>
        <Probe />
      </DaemonContext.Provider>,
    );

    expect(current).toBe(daemon);
  });

  it("sends MCP commands and consumes canonical daemon responses", async () => {
    const sent: Record<string, unknown>[] = [];
    const listeners = new Map<string, (message: unknown) => void>();
    const daemon = createDaemonValue(sent, listeners);
    let current: McpContextType | undefined;

    function Probe() {
      current = useMcp();
      return <Text>{current.servers.length}</Text>;
    }

    const { lastFrame } = render(
      <DaemonContext.Provider value={daemon}>
        <McpContextProvider>
          <Probe />
        </McpContextProvider>
      </DaemonContext.Provider>,
    );

    current?.refresh({ cwd: "/workspace" });
    current?.update({
      serverId: "filesystem",
      enabled: false,
      scope: "default",
    });

    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      type: "list_mcp_servers",
      cwd: "/workspace",
    });
    expect(sent[1]).toMatchObject({
      type: "update_mcp_server",
      serverId: "filesystem",
      enabled: false,
      scope: "default",
    });

    listeners.get("mcp_server_list")?.({
      type: "mcp_server_list",
      ts: "2026-06-25T00:00:00.000Z",
      servers: [
        {
          id: "filesystem",
          source: "user",
          transport: "stdio",
          enabled: true,
          enabledByDefault: true,
          connected: true,
          toolCount: 2,
          assignedAgents: ["assistant"],
        },
      ],
    } satisfies Extract<DaemonMessage, { type: "mcp_server_list" }>);
    await Bun.sleep(0);

    expect(lastFrame()).toBe("1");
    expect(current?.servers[0]?.id).toBe("filesystem");
  });

  it("wires chat subscriptions and actions through canonical daemon messages", async () => {
    const sent: Record<string, unknown>[] = [];
    const listeners = new Map<string, (message: unknown) => void>();
    const daemon = createDaemonValue(sent, listeners);
    let store: ReturnType<typeof useChatRunStore> | undefined;
    let permissionActions:
      | ReturnType<typeof useChatPermissionRequests>
      | undefined;
    let questionActions: ReturnType<typeof useChatQuestionRequests> | undefined;
    let steeringActions: ReturnType<typeof useChatSteering> | undefined;
    let unboundActions: ReturnType<typeof useChatActions> | undefined;

    function Probe() {
      store = useChatRunStore();
      permissionActions = useChatPermissionRequests();
      questionActions = useChatQuestionRequests();
      steeringActions = useChatSteering();
      unboundActions = useChatActions(null);
      return <Text>{store.chatRuns.size}</Text>;
    }

    const { lastFrame } = render(
      <DaemonContext.Provider value={daemon}>
        <ChatRunsContextProvider>
          <Probe />
        </ChatRunsContextProvider>
      </DaemonContext.Provider>,
    );

    unboundActions?.sendInput("ignored");
    unboundActions?.sendSteer("ignored");
    unboundActions?.sendPermissionDecision("deny");
    unboundActions?.sendQuestionResponse("ignored");
    unboundActions?.reset();
    unboundActions?.stop();
    expect(sent).toEqual([]);

    const chatRun = {
      ...createInitialChatRun("daemon-run-1", 0),
      daemonRunId: "daemon-run-1",
      status: "running" as const,
    };
    store?.setChatRuns(new Map([[chatRun.id, chatRun]]));
    await waitFor(() => lastFrame() === "1");
    expect(lastFrame()).toBe("1");
    steeringActions?.sendSteer(chatRun.id, "Refine the answer");

    listeners.get("request_permission")?.({
      type: "request_permission",
      ts: "2026-06-25T00:00:00.000Z",
      requestId: "permission-1",
      runId: chatRun.id,
      agentName: "coder",
      operation: "fs.write",
      resource: "/workspace/file.ts",
      reason: "policy-ask",
    } satisfies Extract<DaemonMessage, { type: "request_permission" }>);
    listeners.get("request_question")?.({
      type: "request_question",
      ts: "2026-06-25T00:00:00.000Z",
      requestId: "question-1",
      runId: chatRun.id,
      agentName: "reviewer",
      question: "Proceed?",
    } satisfies Extract<DaemonMessage, { type: "request_question" }>);
    listeners.get("steer_queued")?.({
      type: "steer_queued",
      ts: "2026-06-25T00:00:00.000Z",
      runId: chatRun.id,
      text: "Use the shared contract",
    } satisfies Extract<DaemonMessage, { type: "steer_queued" }>);
    await waitFor(
      () =>
        store?.chatRuns.get(chatRun.id)?.pendingPermissionRequests.length ===
          1 &&
        store?.chatRuns.get(chatRun.id)?.pendingQuestionRequests.length === 1 &&
        store?.chatRuns.get(chatRun.id)?.messages.at(-1)?.text ===
          "Use the shared contract",
    );

    expect(
      store?.chatRuns.get(chatRun.id)?.pendingPermissionRequests,
    ).toHaveLength(1);
    expect(
      store?.chatRuns.get(chatRun.id)?.pendingQuestionRequests,
    ).toHaveLength(1);
    expect(store?.chatRuns.get(chatRun.id)?.messages.at(-1)?.text).toBe(
      "Use the shared contract",
    );

    permissionActions?.sendPermissionDecision(chatRun.id, "allow");
    questionActions?.sendQuestionResponse(chatRun.id, "yes");
    await Bun.sleep(0);

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "permission_decision",
          permissionRequestId: "permission-1",
          decision: "allow",
        }),
        expect.objectContaining({
          type: "question_response",
          questionRequestId: "question-1",
          response: "yes",
        }),
        expect.objectContaining({
          type: "steer_run",
          text: "Refine the answer",
        }),
      ]),
    );
  });

  it("loads persisted runs and exposes a refresh command", async () => {
    const sent: Record<string, unknown>[] = [];
    const listeners = new Map<string, (message: unknown) => void>();
    const daemon = createDaemonValue(sent, listeners);
    let current: ReturnType<typeof usePersistedRunList> | undefined;

    function Probe() {
      current = usePersistedRunList();
      return <Text>{current.persistedRuns.length}</Text>;
    }

    const { lastFrame } = render(
      <DaemonContext.Provider value={daemon}>
        <Probe />
      </DaemonContext.Provider>,
    );
    expect(sent[0]).toMatchObject({ type: "list_runs", cwd: process.cwd() });

    listeners.get("run_list")?.({
      type: "run_list",
      ts: "2026-06-25T00:00:00.000Z",
      runs: [
        {
          runId: "run-1",
          strategyName: "Research",
          strategyPath: "/strategy.yaml",
          cwd: "/workspace",
          status: "completed",
          startedAt: "2026-06-25T00:00:00.000Z",
          updatedAt: "2026-06-25T00:01:00.000Z",
        },
      ],
    } satisfies Extract<DaemonMessage, { type: "run_list" }>);
    await waitFor(() => lastFrame() === "1");

    expect(lastFrame()).toBe("1");
    current?.fetchPersistedRuns("/other");
    expect(sent.at(-1)).toMatchObject({ type: "list_runs", cwd: "/other" });
  });

  it("discovers strategies once and shares refresh state", async () => {
    let strategyCount = 0;
    let status = "loading";
    let error: string | null = null;
    let refresh: (() => Promise<void>) | undefined;

    function Probe() {
      strategyCount = useDiscoveredStrategies().length;
      ({ status, error } = useStrategyDiscoveryStatus());
      refresh = useRefreshDiscoveredStrategies();
      return <Text>{status}</Text>;
    }

    const { lastFrame } = render(
      <StrategyDiscoveryContextProvider>
        <Probe />
      </StrategyDiscoveryContextProvider>,
    );

    await waitFor(() => status !== "loading");
    expect(status).toBe("ready");
    expect(error).toBeNull();
    expect(strategyCount).toBeGreaterThanOrEqual(0);
    expect(lastFrame()).toBe("ready");

    await refresh?.();
    await waitFor(() => status === "ready");
    expect(status).toBe("ready");
  });

  it("maintains modal data and topmost stack semantics", async () => {
    let first: ModalControls | undefined;
    let second: ModalControls | undefined;

    function Probe() {
      first = useModal("first");
      second = useModal("second");
      return (
        <Text>
          {first.isOpen ? "first-open" : "first-closed"}:
          {second.isOpen ? "second-open" : "second-closed"}
        </Text>
      );
    }

    const { lastFrame } = render(
      <ModalContextProvider>
        <Probe />
      </ModalContextProvider>,
    );

    first?.open({ source: "test" });
    await waitFor(() => first?.isOpen === true);
    expect(first?.data).toEqual({ source: "test" });
    expect(first?.isTopmost).toBe(true);

    second?.open();
    await waitFor(() => second?.isOpen === true);
    expect(first?.isTopmost).toBe(false);
    expect(second?.isTopmost).toBe(true);

    second?.toggle();
    await waitFor(() => second?.isOpen === false);
    expect(first?.isTopmost).toBe(true);

    first?.close();
    await waitFor(() => first?.isOpen === false);
    expect(lastFrame()).toBe("first-closed:second-closed");

    first?.toggle("reopened");
    await waitFor(() => first?.isOpen === true);
    expect(first?.data).toBe("reopened");
  });

  it("registers and cleans up mouse consumers through one event bus", () => {
    let mouse: MouseContextValue | null = null;

    function Probe() {
      mouse = useContext(MouseContext);
      return null;
    }

    const { unmount } = render(
      <MouseProvider>
        <Probe />
      </MouseProvider>,
    );

    const unsubscribe = mouse?.subscribe(() => {});
    const unregisterHover = mouse?.registerHoverConsumer();
    expect(mouse).not.toBeNull();

    unregisterHover?.();
    unsubscribe?.();
    unmount();
  });
});

function createDaemonValue(
  sent: Record<string, unknown>[] = [],
  listeners: Map<string, (message: unknown) => void> = new Map(),
): DaemonContextValue {
  return {
    status: "connected",
    send(message) {
      sent.push(message);
      return true;
    },
    on<MessageKind extends DaemonMessageType>(
      type: MessageKind,
      listener: DaemonMessageListener<MessageKind>,
    ) {
      listeners.set(type, listener as (message: unknown) => void);
      return () => {
        listeners.delete(type);
      };
    },
    off<MessageKind extends DaemonMessageType>(
      type: MessageKind,
      _listener: DaemonMessageListener<MessageKind>,
    ) {
      listeners.delete(type);
    },
  };
}
