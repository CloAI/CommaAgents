import { createConnection } from "@daemon-src/daemon-server/connections";
import type { Connection } from "@daemon-src/daemon-server/connections/connections.types";
import { createBindingRegistry } from "@daemon-src/daemon-server/registry";
import type { Plugin } from "@daemon-src/daemon-plugin";
import { IPC_CHANNELS, MAX_REQUEST_BYTES } from "../shared/ipc";
import type {
  DaemonClosedEvent,
  DaemonMessageEvent,
  OpenResult,
} from "../shared/ipc";

/** The window that sent an IPC message; satisfied by Electron's `WebContents`. */
export interface IpcSender {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
  once(event: "destroyed", listener: () => void): unknown;
  removeListener(event: "destroyed", listener: () => void): unknown;
}

/** What a handler learns about an IPC message; satisfied by Electron's IPC events. */
export interface IpcSenderEvent {
  readonly sender: IpcSender;
  readonly senderFrame: { readonly url: string } | null | undefined;
}

/** The part of Electron's `ipcMain` used here. */
export interface IpcHub {
  handle(
    channel: string,
    handler: (event: IpcSenderEvent) => Promise<OpenResult>,
  ): void;
  on(
    channel: string,
    listener: (event: IpcSenderEvent, ...args: unknown[]) => void,
  ): unknown;
  removeHandler(channel: string): void;
  removeAllListeners(channel: string): unknown;
}

/** Inputs for exposing a daemon kernel over Electron IPC. */
export interface CreateDaemonElectronIPCOptions {
  /** IPC hub of the main process. */
  readonly ipcMain: IpcHub;
  /** Kernel whose plugins serve requests; a rejection is reported to each opener. */
  readonly kernel: Promise<{
    readonly plugins: Readonly<Record<string, Plugin>>;
  }>;
  /** Whether a frame URL belongs to the application's own renderer. */
  readonly isTrusted: (frameUrl: string | undefined) => boolean;
}

/** Listener whose shutdown does not dispose the kernel. */
interface DaemonElectronIPC {
  /** Stop answering and dispose every open connection. */
  stop(): Promise<void>;
}

interface OpenConnection {
  readonly connection: Connection;
  readonly sender: IpcSender;
  readonly forget: () => void;
}

/**
 * Expose a daemon kernel to renderer windows over Electron IPC, like `createDaemonServer` does over WebSocket.
 * Each opened connection is bound to the window that opened it and disposed when that window goes away.
 * @param {CreateDaemonElectronIPCOptions} options - IPC hub, kernel and sender trust check.
 * @returns {DaemonElectronIPC} Shutdown control.
 */
export function createDaemonElectronIPC({
  ipcMain,
  kernel,
  isTrusted,
}: CreateDaemonElectronIPCOptions): DaemonElectronIPC {
  const registry = kernel.then((daemon) =>
    createBindingRegistry(daemon.plugins),
  );
  // A failed start is reported to each opener; keep it from surfacing as unhandled.
  registry.catch(() => undefined);
  const connections = new Map<number, OpenConnection>();
  let nextId = 1;

  const trusted = (event: IpcSenderEvent): boolean =>
    isTrusted(event.senderFrame?.url);

  async function drop(id: number): Promise<void> {
    const open = connections.get(id);
    if (!open) {
      return;
    }
    connections.delete(id);
    open.forget();
    await open.connection.dispose();
  }

  ipcMain.handle(
    IPC_CHANNELS.daemonOpen,
    async (event): Promise<OpenResult> => {
      if (!trusted(event)) {
        return { ok: false, reason: "Untrusted sender" };
      }
      let bindings;
      try {
        bindings = await registry;
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      const id = nextId++;
      const sender = event.sender;
      const onDestroyed = () => void drop(id);
      sender.once("destroyed", onDestroyed);
      const connection = createConnection({
        registry: bindings,
        send(text) {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.daemonMessage, {
              id,
              text,
            } satisfies DaemonMessageEvent);
          }
        },
        close(code, reason) {
          if (!sender.isDestroyed()) {
            sender.send(IPC_CHANNELS.daemonClosed, {
              id,
              code,
              reason,
            } satisfies DaemonClosedEvent);
          }
          void drop(id);
        },
      });
      connections.set(id, {
        connection,
        sender,
        forget: () => sender.removeListener("destroyed", onDestroyed),
      });
      return { ok: true, id };
    },
  );

  ipcMain.on(IPC_CHANNELS.daemonSend, (event, id: unknown, text: unknown) => {
    if (!trusted(event) || typeof id !== "number" || typeof text !== "string") {
      return;
    }
    if (Buffer.byteLength(text) > MAX_REQUEST_BYTES) {
      return;
    }
    const open = connections.get(id);
    if (open?.sender === event.sender) {
      void open.connection.receive(text);
    }
  });

  ipcMain.on(IPC_CHANNELS.daemonClose, (event, id: unknown) => {
    if (!trusted(event) || typeof id !== "number") {
      return;
    }
    if (connections.get(id)?.sender === event.sender) {
      void drop(id);
    }
  });

  return {
    async stop() {
      ipcMain.removeHandler(IPC_CHANNELS.daemonOpen);
      ipcMain.removeAllListeners(IPC_CHANNELS.daemonSend);
      ipcMain.removeAllListeners(IPC_CHANNELS.daemonClose);
      await Promise.allSettled([...connections.keys()].map(drop));
    },
  };
}
