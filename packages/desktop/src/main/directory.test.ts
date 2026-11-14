import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc";

const desktop = vi.hoisted(() => ({
  handle: vi.fn(),
  owner: vi.fn(),
  dialog: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: { handle: desktop.handle },
  BrowserWindow: { fromWebContents: desktop.owner },
  dialog: { showOpenDialog: desktop.dialog },
}));
const { handleDirectorySelection } = await import("./directory");

/** Invoke the registered native chooser as a renderer frame. */
function choose(
  url: string,
  initialDirectory?: unknown,
): Promise<string | undefined> {
  const callback = desktop.handle.mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.chooseDirectory,
  )![1] as (
    event: { senderFrame: { url: string }; sender: object },
    value: unknown,
  ) => Promise<string | undefined>;
  return callback({ senderFrame: { url }, sender: {} }, initialDirectory);
}

describe("handleDirectorySelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    desktop.owner.mockReturnValue(undefined);
    handleDirectorySelection((url) => url === "app");
  });

  it("should open a directory chooser with the current directory and return the selected path", async () => {
    desktop.dialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/projects/new"],
    });
    expect(await choose("app", "/projects/current")).toBe("/projects/new");
    expect(desktop.dialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "/projects/current",
        properties: ["openDirectory", "createDirectory"],
      }),
    );
  });

  it("should leave the directory unchanged when the user cancels", async () => {
    desktop.dialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await choose("app")).toBeUndefined();
  });

  it("should reject untrusted frames and malformed paths before opening a dialog", async () => {
    await expect(choose("untrusted", "/projects")).rejects.toThrow("Untrusted");
    await expect(choose("app", { path: "/projects" })).rejects.toThrow(
      "Invalid",
    );
    expect(desktop.dialog).not.toHaveBeenCalled();
  });
});
