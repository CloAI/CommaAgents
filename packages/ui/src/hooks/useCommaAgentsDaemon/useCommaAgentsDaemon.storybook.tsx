import { act, StrictMode, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, within } from "storybook/test";
import { vi } from "vitest";
import { daemonLogs } from "../useLogBucket/logger";
import { SettingsProvider, useSettings } from "../useSettings";
import { MockWebSocket } from "../useWebSocket/test.utils";
import { CommaAgentsDaemonProvider } from "./useCommaAgentsDaemon.context";
import { useCommaAgentsDaemon } from "./useCommaAgentsDaemon";
import { prepareArguments } from "./useCommaAgentsDaemon.utils";
import { deliver, requests, historyData } from "./test.utils";

/** Exercise independently routed command and channel consumers.
 * @returns {React.ReactElement} The shared-provider fixture.
 */
function DaemonExample() {
  return (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        <DaemonProbe />
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  );
}

/** Render operation controls inside both application providers.
 * @returns {React.ReactElement} The interactive request fixture.
 */
function DaemonProbe() {
  const [showChannel, setShowChannel] = useState(true);
  const [reverseKeys, setReverseKeys] = useState(false);
  const [runId, setRunId] = useState("run-one");
  const [invalidArguments, setInvalidArguments] = useState(false);
  const [commandRunId, setCommandRunId] = useState("command-one");
  const { saveSettings } = useSettings();
  return (
    <>
      <CommandProbe
        name="First"
        runId={commandRunId}
        invalidArguments={invalidArguments}
      />
      <CommandProbe name="Second" runId="other" invalidArguments={false} />
      {showChannel && <ChannelProbe runId={runId} reverseKeys={reverseKeys} />}
      <button onClick={() => setShowChannel(false)}>Unmount channel</button>
      <button onClick={() => setReverseKeys((previous) => !previous)}>
        Reverse keys
      </button>
      <button onClick={() => setRunId("run-two")}>Change arguments</button>
      <button
        onClick={() =>
          setCommandRunId((previous) =>
            previous === "command-one" ? "command-two" : "command-one",
          )
        }
      >
        Change command arguments
      </button>
      <button onClick={() => setInvalidArguments(true)}>
        Invalid arguments
      </button>
      <button
        onClick={() =>
          saveSettings({ daemon: { url: "ws://localhost:7423/ws" } })
        }
      >
        Change endpoint
      </button>
    </>
  );
}

interface CommandProbeProps {
  readonly name: string;
  readonly invalidArguments: boolean;
  readonly runId: string;
}

/** Render one independent command consumer.
 * @param {CommandProbeProps} props - Result label and invalid-input toggle.
 * @returns {React.ReactElement} Command controls and state.
 */
function CommandProbe({ name, runId, invalidArguments }: CommandProbeProps) {
  const result = useCommaAgentsDaemon(
    { command: "runs.history" },
    { runId: invalidArguments ? (Number.NaN as unknown as string) : runId },
  );
  return (
    <>
      <output aria-label={`${name} data`}>{JSON.stringify(result.data)}</output>
      <output aria-label={`${name} errors`}>
        {JSON.stringify(result.errors)}
      </output>
      <output aria-label={`${name} client error`}>
        {result.clientError?.code}
      </output>
      <output aria-label={`${name} loading`}>{String(result.isLoading)}</output>
    </>
  );
}

interface ChannelProbeProps {
  readonly runId: string;
  readonly reverseKeys: boolean;
}

/** Render a subscription with independently rerendered argument objects.
 * @param {ChannelProbeProps} props - Run identity and object-key ordering.
 * @returns {React.ReactElement} Current channel state.
 */
function ChannelProbe({ runId, reverseKeys }: ChannelProbeProps) {
  const argumentsValue = reverseKeys
    ? { history: { limit: 20 }, runId }
    : { runId, history: { limit: 20 } };
  const result = useCommaAgentsDaemon({ channel: "runs" }, argumentsValue);
  return (
    <>
      <output aria-label="Channel data">{JSON.stringify(result.data)}</output>
      <output aria-label="Channel errors">
        {JSON.stringify(result.errors)}
      </output>
      <output aria-label="Channel client error">
        {result.clientError?.code}
      </output>
      <output aria-label="Channel loading">{String(result.isLoading)}</output>
    </>
  );
}

const meta = {
  title: "Hooks/useCommaAgentsDaemon",
  component: DaemonExample,
  render: () => (
    <StrictMode>
      <DaemonExample />
    </StrictMode>
  ),
  beforeEach: () => {
    const environment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    daemonLogs.clear();
    MockWebSocket.instances = [];
    const originalWebSocket = globalThis.WebSocket;
    const originalSettings = localStorage.getItem("comma-agents.settings");
    localStorage.removeItem("comma-agents.settings");
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    return () => {
      environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      vi.useRealTimers();
      globalThis.WebSocket = originalWebSocket;
      if (originalSettings === null)
        localStorage.removeItem("comma-agents.settings");
      else localStorage.setItem("comma-agents.settings", originalSettings);
    };
  },
} satisfies Meta<typeof DaemonExample>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const CommandCorrelation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await expect(requests(socket, "command")).toHaveLength(0);
    await expect(canvas.getByLabelText("First loading")).toHaveTextContent(
      "true",
    );
    await expect(
      canvas.getByLabelText("First client error"),
    ).toBeEmptyDOMElement();
    await act(() => socket.open());
    await expect(requests(socket, "command")).toHaveLength(2);
    const oldFirst = requests(socket, "command").find(
      (request) => request.arguments?.runId === "command-one",
    )!;
    const second = requests(socket, "command").find(
      (request) => request.arguments?.runId === "other",
    )!;
    await fireEvent.click(canvas.getByRole("button", { name: "Reverse keys" }));
    await expect(requests(socket, "command")).toHaveLength(2);
    await fireEvent.click(
      canvas.getByRole("button", { name: "Change command arguments" }),
    );
    const latestFirst = requests(socket, "command").at(-1)!;
    await expect(latestFirst.arguments?.runId).toBe("command-two");
    await expect(
      new Set([oldFirst.requestId, second.requestId, latestFirst.requestId])
        .size,
    ).toBe(3);
    await act(() =>
      deliver(socket, latestFirst.requestId, {
        type: "response",
        ok: true,
        data: historyData("latest"),
      }),
    );
    await act(() =>
      deliver(socket, second.requestId, {
        type: "response",
        ok: true,
        data: historyData("independent"),
      }),
    );
    await act(() =>
      deliver(socket, oldFirst.requestId, {
        type: "response",
        ok: true,
        data: historyData("stale"),
      }),
    );
    await expect(canvas.getByLabelText("First data")).toHaveTextContent(
      '"before":"latest"',
    );
    await expect(canvas.getByLabelText("Second data")).toHaveTextContent(
      '"before":"independent"',
    );
    await expect(canvas.getByLabelText("First loading")).toHaveTextContent(
      "false",
    );
    await expect(requests(socket, "command")).toHaveLength(3);
    await fireEvent.click(
      canvas.getByRole("button", { name: "Change command arguments" }),
    );
    await expect(canvas.getByLabelText("First data")).toBeEmptyDOMElement();
    const request = requests(socket, "command").at(-1)!;
    const error = {
      code: "NOT_FOUND",
      message: "No matching run.",
      metadata: { runId: "missing" },
    };
    await act(() =>
      deliver(socket, request.requestId, {
        type: "response",
        ok: false,
        error,
      }),
    );
    await expect(canvas.getByLabelText("First errors")).toHaveTextContent(
      JSON.stringify(error),
    );
    await expect(daemonLogs.getSnapshot().at(-1)).toMatchObject({
      level: "error",
      message: "No matching run.",
      count: 1,
      details: `command: runs.history; requestId: ${request.requestId}; code: NOT_FOUND`,
    });
    await expect(JSON.stringify(daemonLogs.getSnapshot())).not.toContain(
      "missing",
    );
    await expect(
      canvas.getByLabelText("First client error"),
    ).toBeEmptyDOMElement();
  },
};

export const ChannelLifecycle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await expect(canvas.getByLabelText("Channel loading")).toHaveTextContent(
      "true",
    );
    await act(() => socket.open());
    const subscription = requests(socket, "subscribe").at(-1)!;
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "response",
        ok: true,
        data: null,
      }),
    );
    await expect(canvas.getByLabelText("Channel loading")).toHaveTextContent(
      "false",
    );
    await expect(canvas.getByLabelText("Channel data")).toBeEmptyDOMElement();
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.step",
        data: { runId: "run-one", phase: "started", stepName: "first" },
      }),
    );
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.step",
        data: { runId: "run-one", phase: "completed", stepName: "second" },
      }),
    );
    await expect(canvas.getByLabelText("Channel data")).toHaveTextContent(
      '"type":"run.step"',
    );
    await expect(canvas.getByLabelText("Channel data")).toHaveTextContent(
      '"stepName":"second"',
    );
    await fireEvent.click(canvas.getByRole("button", { name: "Reverse keys" }));
    await expect(requests(socket, "subscribe")).toHaveLength(1);
    await fireEvent.click(
      canvas.getByRole("button", { name: "Change arguments" }),
    );
    await expect(requests(socket, "unsubscribe")).toEqual([
      { type: "unsubscribe", requestId: subscription.requestId },
    ]);
    await expect(requests(socket, "subscribe")).toHaveLength(2);
    await expect(canvas.getByLabelText("Channel data")).toBeEmptyDOMElement();
    const replacement = requests(socket, "subscribe").at(-1)!;
    await expect(replacement.arguments?.runId).toBe("run-two");
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.step",
        data: { runId: "run-one", phase: "completed", stepName: "stale" },
      }),
    );
    await expect(canvas.getByLabelText("Channel data")).toBeEmptyDOMElement();
    await fireEvent.click(
      canvas.getByRole("button", { name: "Unmount channel" }),
    );
    await expect(requests(socket, "unsubscribe").at(-1)?.requestId).toBe(
      replacement.requestId,
    );
  },
};

export const ReconnectAndCompletion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    const subscription = requests(socket, "subscribe").at(-1)!;
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "response",
        ok: true,
        data: null,
      }),
    );
    await act(() =>
      deliver(socket, subscription.requestId, {
        type: "run.step",
        data: { runId: "run-one", phase: "started", stepName: "retained" },
      }),
    );
    await act(() => socket.fail());
    await expect(
      daemonLogs.getSnapshot().filter((entry) => entry.level === "warn"),
    ).toHaveLength(1);
    await expect(
      daemonLogs.getSnapshot().filter((entry) => entry.level === "error"),
    ).toHaveLength(0);
    await expect(canvas.getByLabelText("First client error")).toHaveTextContent(
      "CONNECTION_LOST",
    );
    await expect(canvas.getByLabelText("Channel data")).toHaveTextContent(
      "retained",
    );
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const nextSocket = MockWebSocket.instances.at(-1)!;
    await act(() => nextSocket.open());
    await expect(requests(nextSocket, "command")).toHaveLength(0);
    const restored = requests(nextSocket, "subscribe").at(-1)!;
    await expect(restored.requestId).not.toBe(subscription.requestId);
    await act(() =>
      deliver(nextSocket, restored.requestId, {
        type: "response",
        ok: true,
        data: null,
      }),
    );
    await act(() =>
      deliver(nextSocket, subscription.requestId, {
        type: "run.step",
        data: { runId: "run-one", phase: "completed", stepName: "stale" },
      }),
    );
    await expect(canvas.getByLabelText("Channel data")).toHaveTextContent(
      "retained",
    );
    await act(() =>
      deliver(nextSocket, restored.requestId, {
        type: "subscription_end",
        reason: "completed",
      }),
    );
    await expect(canvas.getByLabelText("Channel loading")).toHaveTextContent(
      "false",
    );
    await expect(canvas.getByLabelText("Channel errors")).toBeEmptyDOMElement();
    await act(() => nextSocket.fail());
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const finalSocket = MockWebSocket.instances.at(-1)!;
    await act(() => finalSocket.open());
    await expect(requests(finalSocket, "subscribe")).toHaveLength(0);
  },
};

export const EndpointAndFailures: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await expect(canvas.getByLabelText("First client error")).toHaveTextContent(
      "TIMEOUT",
    );
    await expect(
      canvas.getByLabelText("Channel client error"),
    ).toHaveTextContent("TIMEOUT");
    await fireEvent.click(
      canvas.getByRole("button", { name: "Change command arguments" }),
    );
    await act(() => socket.message("not-json"));
    await expect(
      daemonLogs
        .getSnapshot()
        .filter(
          (entry) =>
            entry.message === "The daemon sent an invalid protocol message.",
        ),
    ).toHaveLength(1);
    await expect(canvas.getByLabelText("First client error")).toHaveTextContent(
      "INVALID_MESSAGE",
    );
    const commandCount = requests(socket, "command").length;
    await fireEvent.click(
      canvas.getByRole("button", { name: "Invalid arguments" }),
    );
    await expect(canvas.getByLabelText("First client error")).toHaveTextContent(
      "INVALID_ARGUMENTS",
    );
    await expect(requests(socket, "command")).toHaveLength(commandCount);
    await expect(daemonLogs.getSnapshot().at(-1)?.details).toBe(
      "command: runs.history; code: INVALID_ARGUMENTS",
    );
    await fireEvent.click(
      canvas.getByRole("button", { name: "Change endpoint" }),
    );
    await expect(socket.readyState).toBe(3);
    await expect(
      daemonLogs
        .getSnapshot()
        .some((entry) => entry.message.startsWith("Daemon endpoint changed.")),
    ).toBe(true);
    await expect(
      daemonLogs
        .getSnapshot()
        .some((entry) => entry.details?.includes("INVALID_ARGUMENTS")),
    ).toBe(true);
    const nextSocket = MockWebSocket.instances.at(-1)!;
    await expect(nextSocket.url).toBe("ws://localhost:7423/ws");
    await act(() => nextSocket.open());
    await expect(requests(nextSocket, "subscribe")).toHaveLength(1);
    await expect(requests(nextSocket, "command")).toHaveLength(1);
    await expect(requests(nextSocket, "command")[0]?.arguments?.runId).toBe(
      "other",
    );
    await expect(canvas.getByLabelText("Channel data")).toBeEmptyDOMElement();
    await expect(
      JSON.parse(localStorage.getItem("comma-agents.settings")!).daemon.url,
    ).toBe(nextSocket.url);
  },
};

export const SendFailureAndRejectedSubscription: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    socket.throwOnSend = true;
    await act(() => socket.open());
    await expect(
      canvas.getByLabelText("Channel client error"),
    ).toHaveTextContent("CONNECTION_LOST");
    await expect(canvas.getByLabelText("Channel loading")).toHaveTextContent(
      "true",
    );
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const nextSocket = MockWebSocket.instances.at(-1)!;
    await act(() => nextSocket.open());
    await expect(requests(nextSocket, "subscribe")).toHaveLength(1);
    const restored = requests(nextSocket, "subscribe")[0]!;
    const error = {
      code: "RUN_NOT_FOUND",
      message: "Run is unavailable.",
      metadata: { runId: "run-one" },
    };
    await act(() =>
      deliver(nextSocket, restored.requestId, {
        type: "response",
        ok: false,
        error,
      }),
    );
    await expect(canvas.getByLabelText("Channel errors")).toHaveTextContent(
      JSON.stringify(error),
    );
    await expect(canvas.getByLabelText("Channel loading")).toHaveTextContent(
      "false",
    );
    await expect(
      canvas.getByLabelText("Channel client error"),
    ).toBeEmptyDOMElement();
    await act(() => nextSocket.fail());
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const finalSocket = MockWebSocket.instances.at(-1)!;
    await act(() => finalSocket.open());
    await expect(requests(finalSocket, "subscribe")).toHaveLength(0);
    await expect(canvas.getByLabelText("Channel errors")).toHaveTextContent(
      JSON.stringify(error),
    );
  },
};

export const WaitingForConnection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await fireEvent.click(
      canvas.getByRole("button", { name: "Change command arguments" }),
    );
    await act(() => socket.fail());
    await expect(canvas.getByLabelText("First loading")).toHaveTextContent(
      "true",
    );
    await expect(
      canvas.getByLabelText("First client error"),
    ).toBeEmptyDOMElement();
    await expect(requests(socket, "command")).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const nextSocket = MockWebSocket.instances.at(-1)!;
    await act(() => nextSocket.open());
    const commands = requests(nextSocket, "command");
    await expect(commands).toHaveLength(2);
    await expect(
      commands.map((request) => request.arguments?.runId).sort(),
    ).toEqual(["command-two", "other"]);
    await expect(
      commands.every((request) => request.arguments?.runId !== "command-one"),
    ).toBe(true);
  },
};

export const ArgumentSerialization: Story = {
  play: async () => {
    const shared = { z: 2, a: 1 };
    const first = { b: [shared, shared], a: 1, optional: undefined };
    const second = {
      a: 1,
      b: [
        { a: 1, z: 2 },
        { z: 2, a: 1 },
      ],
    };
    await expect(prepareArguments(first)).toEqual(prepareArguments(second));
    await expect(Object.keys(shared)).toEqual(["z", "a"]);
    await expect(
      prepareArguments(JSON.parse('{"__proto__":{"safe":true}}')),
    ).toEqual({
      key: '{"__proto__":{"safe":true}}',
    });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const value of [
      null,
      [],
      42,
      cycle,
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: BigInt(1) },
      { value: () => {} },
      { value: Symbol("value") },
      { value: new Date() },
      { value: [undefined] },
      { value: Array(1) },
      { [Symbol("key")]: "value" },
    ]) {
      await expect(prepareArguments(value)).toEqual({
        error: {
          code: "INVALID_ARGUMENTS",
          message:
            "Arguments must be a JSON object without unsupported values or cycles.",
        },
      });
    }
  },
};
