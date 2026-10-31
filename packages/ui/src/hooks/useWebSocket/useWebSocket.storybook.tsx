import { StrictMode, useState } from "react";
import { act } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, within } from "storybook/test";
import { vi } from "vitest";
import { useWebSocket } from "./useWebSocket";
import { MockWebSocket } from "./test.utils";

/** Demonstrate connection state and exercise lifecycle changes.
 * @returns {React.ReactElement} The lifecycle example.
 */
function WebSocketExample() {
  const [url, setUrl] = useState("ws://localhost:7422/ws");
  const [message, setMessage] = useState<unknown>();
  const [showConnection, setShowConnection] = useState(true);
  return (
    <>
      <button onClick={() => setUrl("ws://localhost:7423/ws")}>
        Change endpoint
      </button>
      <button onClick={() => setShowConnection(false)}>Unmount</button>
      {showConnection && <WebSocketProbe url={url} onMessage={setMessage} />}
      <output aria-label="Message">{String(message)}</output>
    </>
  );
}

interface WebSocketProbeProps {
  readonly url: string;
  readonly onMessage: (data: unknown) => void;
}

/** Render a live hook consumer for the lifecycle stories.
 * @param {WebSocketProbeProps} props - Endpoint and message handler.
 * @returns {React.ReactElement} Connection status and send action.
 */
function WebSocketProbe({ url, onMessage }: WebSocketProbeProps) {
  const { status, error, send } = useWebSocket({ url, onMessage });
  const [sent, setSent] = useState<boolean>();
  return (
    <>
      <output aria-label="Status">{status}</output>
      <output aria-label="Error">{error?.message}</output>
      <output aria-label="Sent">{String(sent)}</output>
      <button onClick={() => setSent(send("request"))}>Send</button>
    </>
  );
}

const meta = {
  title: "Hooks/useWebSocket",
  component: WebSocketExample,
  render: () => (
    <StrictMode>
      <WebSocketExample />
    </StrictMode>
  ),
  beforeEach: () => {
    const environment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    MockWebSocket.instances = [];
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    return () => {
      environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      vi.useRealTimers();
      globalThis.WebSocket = originalWebSocket;
    };
  },
} satisfies Meta<typeof WebSocketExample>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Lifecycle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await fireEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(canvas.getByLabelText("Sent")).toHaveTextContent("false");
    await act(() => socket.open());
    await expect(canvas.getByLabelText("Status")).toHaveTextContent(
      "connected",
    );
    await fireEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(socket.sent).toEqual(["request"]);
    await act(() => socket.message("response"));
    await expect(canvas.getByLabelText("Message")).toHaveTextContent(
      "response",
    );
    const oldMessageHandler = socket.onmessage;
    await fireEvent.click(
      canvas.getByRole("button", { name: "Change endpoint" }),
    );
    await expect(socket.readyState).toBe(3);
    await expect(MockWebSocket.instances.at(-1)?.url).toBe(
      "ws://localhost:7423/ws",
    );
    await act(() =>
      oldMessageHandler?.({ data: "stale" } as MessageEvent<unknown>),
    );
    await expect(canvas.getByLabelText("Message")).toHaveTextContent(
      "response",
    );
    const activeSocket = MockWebSocket.instances.at(-1)!;
    await fireEvent.click(canvas.getByRole("button", { name: "Unmount" }));
    await expect(activeSocket.readyState).toBe(3);
    const count = MockWebSocket.instances.length;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await expect(MockWebSocket.instances).toHaveLength(count);
  },
};

export const ExponentialReconnect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
      const count = MockWebSocket.instances.length;
      await act(() => MockWebSocket.instances.at(-1)!.fail());
      await expect(canvas.getByLabelText("Status")).toHaveTextContent(
        "reconnecting",
      );
      await act(() => vi.advanceTimersByTimeAsync(delay - 100));
      await expect(MockWebSocket.instances).toHaveLength(count);
      await act(() => vi.advanceTimersByTimeAsync(100));
      await expect(MockWebSocket.instances).toHaveLength(count + 1);
    }
    await act(() => MockWebSocket.instances.at(-1)!.open());
    await expect(canvas.getByLabelText("Error")).toBeEmptyDOMElement();
    const count = MockWebSocket.instances.length;
    await act(() => MockWebSocket.instances.at(-1)!.fail());
    await act(() => vi.advanceTimersByTimeAsync(2000));
    await expect(MockWebSocket.instances).toHaveLength(count + 1);
  },
};

export const TimeoutAndSendFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await expect(canvas.getByLabelText("Error")).toHaveTextContent("timed out");
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    socket.throwOnSend = true;
    await fireEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(canvas.getByLabelText("Sent")).toHaveTextContent("false");
    await expect(canvas.getByLabelText("Status")).toHaveTextContent(
      "reconnecting",
    );
    await expect(canvas.getByLabelText("Error")).toHaveTextContent(
      "Sending failed",
    );
    await expect(socket.readyState).toBe(3);
  },
};

export const ClosingSocket: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    const onError = socket.onerror;
    const onClose = socket.onclose;
    const count = MockWebSocket.instances.length;
    socket.readyState = 2;
    await fireEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(canvas.getByLabelText("Sent")).toHaveTextContent("false");
    await expect(canvas.getByLabelText("Status")).toHaveTextContent(
      "reconnecting",
    );
    await expect(socket.sent).toHaveLength(0);
    await act(() => {
      onError?.();
      onClose?.(new CloseEvent("close", { code: 1006 }));
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    await expect(MockWebSocket.instances).toHaveLength(count + 1);
    await expect(MockWebSocket.instances.at(-1)).not.toBe(socket);
  },
};

export const ConstructorFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const previousWebSocket = globalThis.WebSocket;
    let attempts = 0;
    globalThis.WebSocket = class {
      constructor() {
        attempts++;
        throw new Error("Constructor failed.");
      }
    } as unknown as typeof WebSocket;
    try {
      await fireEvent.click(
        canvas.getByRole("button", { name: "Change endpoint" }),
      );
      await expect(canvas.getByLabelText("Error")).toHaveTextContent(
        "Constructor failed",
      );
      await act(() => vi.advanceTimersByTimeAsync(2000));
      await expect(attempts).toBe(2);
      await fireEvent.click(canvas.getByRole("button", { name: "Unmount" }));
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      await expect(attempts).toBe(2);
    } finally {
      globalThis.WebSocket = previousWebSocket;
    }
  },
};
