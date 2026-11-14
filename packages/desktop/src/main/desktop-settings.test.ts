import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";
import type { DesktopSettings } from "../shared/ipc";
import type { IpcHub, IpcSenderEvent } from "./daemon-ipc";
import { readDesktopConfig, updateDesktopConfig } from "./desktop-config";
import {
  createDesktopSettings,
  handleDesktopSettings,
  keepRunningInBackground,
} from "./desktop-settings";
import type { LoginItem } from "./desktop-settings";

const file = () =>
  join(mkdtempSync(join(tmpdir(), "comma-desktop-")), "desktop.json");

/**
 * A login item that records what was asked of it.
 * @param {boolean} packaged - Whether the fake build counts as packaged.
 * @returns {{ loginItem: LoginItem; state: { enabled: boolean } }} The login item and its recorded state.
 */
function fakeLoginItem(packaged: boolean) {
  const state = { enabled: false };
  const loginItem: LoginItem = {
    packaged,
    isEnabled: () => state.enabled,
    setEnabled: (enabled) => {
      state.enabled = enabled;
    },
  };
  return { loginItem, state };
}

describe("keepRunningInBackground", () => {
  it("uses the saved choice, otherwise the platform default", () => {
    expect(keepRunningInBackground(false, "darwin")).toBe(false);
    expect(keepRunningInBackground(true, "linux")).toBe(true);
    expect(keepRunningInBackground(undefined, "darwin")).toBe(true);
    expect(keepRunningInBackground(undefined, "win32")).toBe(true);
    expect(keepRunningInBackground(undefined, "linux")).toBe(false);
  });
});

describe("createDesktopSettings", () => {
  it("saves the background choice without disturbing the window placement", () => {
    const path = file();
    const window = { width: 900, height: 700, maximized: false };
    updateDesktopConfig(path, { window });
    const { loginItem } = fakeLoginItem(true);
    const settings = createDesktopSettings({
      file: path,
      platform: "win32",
      loginItem,
    });

    expect(settings.set({ keepRunningInBackground: false })).toMatchObject({
      keepRunningInBackground: false,
    });
    expect(settings.keepRunning()).toBe(false);
    expect(readDesktopConfig(path).window).toEqual(window);
  });

  it("starts on login through the operating system where supported", () => {
    const { loginItem, state } = fakeLoginItem(true);
    const settings = createDesktopSettings({
      file: file(),
      platform: "darwin",
      loginItem,
    });

    expect(settings.get().startOnLoginAvailable).toBe(true);
    expect(settings.set({ startOnLogin: true }).startOnLogin).toBe(true);
    expect(state.enabled).toBe(true);
  });

  it("refuses to start on login on Linux and in unpackaged builds", () => {
    for (const [platform, packaged] of [
      ["linux", true],
      ["win32", false],
    ] as const) {
      const { loginItem, state } = fakeLoginItem(packaged);
      const settings = createDesktopSettings({
        file: file(),
        platform,
        loginItem,
      });

      expect(settings.get()).toMatchObject({
        startOnLogin: false,
        startOnLoginAvailable: false,
      });
      expect(() => settings.set({ startOnLogin: true })).toThrow(
        "not available",
      );
      expect(state.enabled).toBe(false);
    }
  });
});

describe("handleDesktopSettings", () => {
  const TRUSTED = "app://trusted/";
  type Handler = (event: IpcSenderEvent, ...args: unknown[]) => Promise<object>;

  function register() {
    const handlers = new Map<string, Handler>();
    const ipcMain: IpcHub = {
      handle: (channel, handler) => void handlers.set(channel, handler),
      on: () => undefined,
      removeHandler: () => undefined,
      removeAllListeners: () => undefined,
    };
    const { loginItem } = fakeLoginItem(true);
    handleDesktopSettings(
      ipcMain,
      createDesktopSettings({ file: file(), platform: "darwin", loginItem }),
      (url) => url === TRUSTED,
    );
    const sender: IpcSenderEvent["sender"] = {
      isDestroyed: () => false,
      send: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
    };
    const call = (channel: string, url: string, ...args: unknown[]) =>
      handlers.get(channel)!({ sender, senderFrame: { url } }, ...args);
    return { call };
  }

  it("answers the application's own page", async () => {
    const { call } = register();
    const before = await call(IPC_CHANNELS.settingsGet, TRUSTED);
    expect(before).toMatchObject<Partial<DesktopSettings>>({
      keepRunningInBackground: true,
    });
    expect(
      await call(IPC_CHANNELS.settingsSet, TRUSTED, {
        keepRunningInBackground: false,
      }),
    ).toMatchObject({ keepRunningInBackground: false });
  });

  it("rejects other senders and malformed changes", async () => {
    const { call } = register();
    await expect(
      call(IPC_CHANNELS.settingsGet, "https://evil.example/"),
    ).rejects.toThrow("Untrusted");
    await expect(
      call(IPC_CHANNELS.settingsSet, TRUSTED, {
        keepRunningInBackground: "yes",
      }),
    ).rejects.toThrow("Invalid");
    await expect(
      call(IPC_CHANNELS.settingsSet, TRUSTED, { extra: true }),
    ).rejects.toThrow("Invalid");
  });
});
