import { describe, expect, it, vi } from "vitest";
import { BrowserWindow } from "electron";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  screen: {},
  shell: {},
}));

const {
  handleWindowControls,
  parseWindowCommand,
  trustedUrlChecker,
  setWindowPinned,
} = await import("./window");

describe("trustedUrlChecker", () => {
  it("trusts the dev server origin, including routes and hashes", () => {
    const trusted = trustedUrlChecker("http://localhost:5173/");
    expect(trusted("http://localhost:5173/#/runs/abc")).toBe(true);
    expect(trusted("http://localhost:5174/")).toBe(false);
    expect(trusted("https://example.com/")).toBe(false);
  });

  it("trusts only the built page for file URLs, ignoring the hash", () => {
    const trusted = trustedUrlChecker("file:///app/out/renderer/index.html");
    expect(trusted("file:///app/out/renderer/index.html#/runs/abc")).toBe(true);
    expect(trusted("file:///etc/passwd")).toBe(false);
  });

  it("rejects missing and malformed URLs", () => {
    const trusted = trustedUrlChecker("http://localhost:5173/");
    expect(trusted(undefined)).toBe(false);
    expect(trusted("not a url")).toBe(false);
  });
});

describe("parseWindowCommand", () => {
  it("accepts the three window commands", () => {
    expect(parseWindowCommand("minimize")).toBe("minimize");
    expect(parseWindowCommand("toggleMaximize")).toBe("toggleMaximize");
    expect(parseWindowCommand("close")).toBe("close");
  });

  it("rejects anything else", () => {
    expect(parseWindowCommand("quit")).toBeUndefined();
    expect(parseWindowCommand(undefined)).toBeUndefined();
    expect(parseWindowCommand({ command: "close" })).toBeUndefined();
  });
});

describe("window appearance IPC", () => {
  function setup() {
    const ipc = {
      handle: vi.fn<IpcMain["handle"]>(),
      on: vi.fn<IpcMain["on"]>(),
    };
    let opacity = 1;
    let alwaysOnTop = false;
    const window = {
      getOpacity: () => opacity,
      isAlwaysOnTop: () => alwaysOnTop,
      setOpacity: vi.fn((value: number) => {
        opacity = value;
      }),
      setAlwaysOnTop: vi.fn((value: boolean) => {
        alwaysOnTop = value;
      }),
      setVisibleOnAllWorkspaces: vi.fn(),
    };
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(
      window as unknown as BrowserWindow,
    );
    handleWindowControls(
      ipc as unknown as IpcMain,
      (url) => url === "app://trusted",
    );
    const event = {
      sender: {},
      senderFrame: { url: "app://trusted" },
    } as unknown as IpcMainInvokeEvent;
    const get = ipc.handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.windowAppearanceGet,
    )![1];
    const set = ipc.handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.windowAppearanceSet,
    )![1];
    return { window, event, get, set };
  }

  it("should read and change only the sender's window, preserving other settings", () => {
    const { window, event, get, set } = setup();
    expect(get(event)).toEqual({ alwaysOnTop: false, opacity: 1 });
    expect(set(event, { alwaysOnTop: true })).toEqual({
      alwaysOnTop: true,
      opacity: 1,
    });
    expect(set(event, { opacity: 0.4 })).toEqual({
      alwaysOnTop: true,
      opacity: 0.4,
    });
    expect(set(event, { alwaysOnTop: false })).toEqual({
      alwaysOnTop: false,
      opacity: 0.4,
    });
    expect(BrowserWindow.fromWebContents).toHaveBeenLastCalledWith(
      event.sender,
    );
    expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });

  it("should clamp window opacity to the visible range of 15% to 100%", () => {
    const { event, set } = setup();
    expect(set(event, { opacity: 0 })).toEqual({
      alwaysOnTop: false,
      opacity: 0.15,
    });
    expect(set(event, { opacity: 0.15 })).toEqual({
      alwaysOnTop: false,
      opacity: 0.15,
    });
    expect(set(event, { opacity: 2 })).toEqual({
      alwaysOnTop: false,
      opacity: 1,
    });
  });

  it("should reject malformed patches before changing either setting", () => {
    const { window, event, set } = setup();
    for (const patch of [
      null,
      { opacity: NaN },
      { opacity: Infinity },
      { opacity: "0.5" },
      { alwaysOnTop: 1 },
      { alwaysOnTop: true, opacity: "bad" },
      { unknown: true },
    ]) {
      expect(() => set(event, patch)).toThrow();
    }
    expect(window.setOpacity).not.toHaveBeenCalled();
    expect(window.setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it("should reject untrusted senders and windows that no longer exist", () => {
    const { window, event, get, set } = setup();
    const untrusted = {
      ...event,
      senderFrame: { url: "https://example.com" },
    } as IpcMainInvokeEvent;
    expect(() => get(untrusted)).toThrow("Untrusted window");
    expect(() => set(untrusted, { opacity: 0.15 })).toThrow("Untrusted window");
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null);
    expect(() => get(event)).toThrow("Untrusted window");
    expect(() => set(event, { alwaysOnTop: true })).toThrow("Untrusted window");
    expect(window.setOpacity).not.toHaveBeenCalled();
    expect(window.setAlwaysOnTop).not.toHaveBeenCalled();
  });
});

describe("setWindowPinned", () => {
  it("should keep a pinned macOS window above fullscreen Spaces and undo both settings on unpin", () => {
    const window = {
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
    };
    setWindowPinned(window, true, "darwin");
    expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(
      true,
      "screen-saver",
    );
    expect(window.setVisibleOnAllWorkspaces).toHaveBeenLastCalledWith(true, {
      visibleOnFullScreen: true,
    });
    setWindowPinned(window, false, "darwin");
    expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(window.setVisibleOnAllWorkspaces).toHaveBeenLastCalledWith(false, {
      visibleOnFullScreen: false,
    });
  });

  it("should elevate pinned Windows windows without calling workspace APIs", () => {
    const window = {
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
    };
    setWindowPinned(window, true, "win32");
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
    expect(window.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
    setWindowPinned(window, false, "win32");
    expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });

  it("should use ordinary pinning on Linux", () => {
    const window = {
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
    };
    setWindowPinned(window, true, "linux");
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(window.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
  });
});
