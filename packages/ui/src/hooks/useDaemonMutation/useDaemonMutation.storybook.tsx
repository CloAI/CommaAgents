import { act, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, within } from "storybook/test";
import { SettingsProvider } from "../useSettings";
import { CommaAgentsDaemonProvider } from "../useCommaAgentsDaemon";
import { deliver, requests } from "../useCommaAgentsDaemon/test.utils";
import { MockWebSocket } from "../useWebSocket/test.utils";
import { useDaemonMutation } from "./useDaemonMutation";

/** Exercise command correlation and cancellation through the actual shared context.
 * @returns {React.ReactElement} Interactive mutation fixture.
 */
function MutationExample() {
  const [mounted, setMounted] = useState(true);
  const [cancelled, setCancelled] = useState("");
  return (
    <SettingsProvider>
      <CommaAgentsDaemonProvider>
        {mounted && <MutationProbe name="First" onFailure={setCancelled} />}
        <MutationProbe name="Second" onFailure={() => {}} />
        <button onClick={() => setMounted(false)}>Unmount first</button>
        <output aria-label="Cancellation">{cancelled}</output>
      </CommaAgentsDaemonProvider>
    </SettingsProvider>
  );
}
interface MutationProbeProps {
  readonly name: string;
  readonly onFailure: (message: string) => void;
}
/** Show one independent mutation consumer.
 * @param {MutationProbeProps} props - Consumer identity and failure observer.
 * @returns {React.ReactElement} Explicit command button and result.
 */
function MutationProbe({ name, onFailure }: MutationProbeProps) {
  const result = useDaemonMutation("core.providers.getConfiguration");
  return (
    <>
      <button
        onClick={() => {
          void result
            .mutate({ providerId: name })
            .catch((error: unknown) =>
              onFailure(
                error && typeof error === "object" && "message" in error
                  ? String(error.message)
                  : "Failed",
              ),
            );
        }}
      >
        Send {name}
      </button>
      <output aria-label={`${name} result`}>{result.data?.providerId}</output>
      <output aria-label={`${name} loading`}>{String(result.isLoading)}</output>
      <output aria-label={`${name} error`}>
        {JSON.stringify(result.errors ?? result.clientError)}
      </output>
    </>
  );
}
const meta = {
  title: "Hooks/useDaemonMutation",
  component: MutationExample,
  beforeEach: () => {
    const original = globalThis.WebSocket;
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    return () => {
      globalThis.WebSocket = original;
    };
  },
} satisfies Meta<typeof MutationExample>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
const data = (providerId: string) => ({
  providerId,
  authStatus: "none",
  hasSavedCredential: false,
  credentialSource: "none",
  verificationSupported: false,
  customProvider: null,
  customModels: [],
});
export const CorrelatedCommands: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    await expect(requests(socket)).toHaveLength(0);
    fireEvent.click(canvas.getByRole("button", { name: "Send First" }));
    fireEvent.click(canvas.getByRole("button", { name: "Send Second" }));
    const [first, second] = requests(socket, "command");
    await expect(first!.command).toBe("core.providers.getConfiguration");
    await expect(first!.arguments).toEqual({ providerId: "First" });
    await act(() =>
      deliver(socket, second!.requestId, {
        type: "response",
        ok: true,
        data: data("Second"),
      }),
    );
    await expect(canvas.getByLabelText("Second result")).toHaveTextContent(
      "Second",
    );
    await expect(canvas.getByLabelText("First loading")).toHaveTextContent(
      "true",
    );
    await act(() =>
      deliver(socket, first!.requestId, {
        type: "response",
        ok: true,
        data: data("First"),
      }),
    );
    await expect(canvas.getByLabelText("First result")).toHaveTextContent(
      "First",
    );
  },
};
export const OfflineAndErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      socket = MockWebSocket.instances.at(-1)!;
    fireEvent.click(canvas.getByRole("button", { name: "Send First" }));
    await expect(canvas.getByLabelText("First error")).toHaveTextContent(
      "CONNECTION_LOST",
    );
    await expect(requests(socket)).toHaveLength(0);
    await act(() => socket.open());
    fireEvent.click(canvas.getByRole("button", { name: "Send First" }));
    const request = requests(socket, "command")[0]!;
    await act(() =>
      deliver(socket, request.requestId, {
        type: "response",
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Missing provider",
          metadata: { retryable: false },
        },
      }),
    );
    await expect(canvas.getByLabelText("First error")).toHaveTextContent(
      '"retryable":false',
    );
    await expect(canvas.getByLabelText("First loading")).toHaveTextContent(
      "false",
    );
    await expect(requests(socket)).toHaveLength(1);
  },
};
export const UnmountPending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      socket = MockWebSocket.instances.at(-1)!;
    await act(() => socket.open());
    fireEvent.click(canvas.getByRole("button", { name: "Send First" }));
    const request = requests(socket, "command")[0]!;
    await act(async () => {
      fireEvent.click(canvas.getByRole("button", { name: "Unmount first" }));
    });
    await expect(canvas.getByLabelText("Cancellation")).toHaveTextContent(
      "cancelled",
    );
    await act(() =>
      deliver(socket, request.requestId, {
        type: "response",
        ok: true,
        data: data("ignored"),
      }),
    );
    await expect(requests(socket)).toHaveLength(1);
  },
};
