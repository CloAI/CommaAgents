import { describe, expect, it, vi } from "vitest";

// Electron's runtime cannot load the native WebSocket addon, so importing the
// embedded runtime must never reach it.
vi.mock("uWebSockets.js", () => {
  throw new Error("uWebSockets.js must not be loaded by the desktop runtime");
});

describe("daemon runtime module", () => {
  it("loads without the WebSocket server", async () => {
    const module = await import("./daemon-runtime");
    expect(module.startDaemonElectronRuntime).toBeTypeOf("function");
  });
});
