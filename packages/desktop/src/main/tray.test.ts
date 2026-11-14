import { describe, expect, it, vi } from "vitest";

// The tray module imports Electron's runtime; only its pure menu model is under test.
vi.mock("electron", () => ({
  app: {},
  Menu: {},
  nativeImage: {},
  Tray: class {},
}));

const { trayMenuTemplate } = await import("./tray");

const labels = (items: ReturnType<typeof trayMenuTemplate>) =>
  items.map((item) => (item.kind === "separator" ? "---" : item.label));

describe("trayMenuTemplate", () => {
  it("offers to hide a visible window and to show a hidden one", () => {
    const state = { status: { kind: "running" } as const, activeRuns: 0 };
    expect(labels(trayMenuTemplate({ ...state, windowVisible: true }))[0]).toBe(
      "Hide Comma Agents",
    );
    expect(
      labels(trayMenuTemplate({ ...state, windowVisible: false }))[0],
    ).toBe("Show Comma Agents");
  });

  it("reports the daemon and its active runs, and what quitting stops", () => {
    expect(
      labels(
        trayMenuTemplate({
          windowVisible: true,
          status: { kind: "running" },
          activeRuns: 0,
        }),
      ),
    ).toEqual([
      "Hide Comma Agents",
      "Daemon running",
      "---",
      "Quit (stops the daemon)",
    ]);
    expect(
      labels(
        trayMenuTemplate({
          windowVisible: false,
          status: { kind: "running" },
          activeRuns: 2,
        }),
      ),
    ).toEqual([
      "Show Comma Agents",
      "Daemon running · 2 runs active",
      "---",
      "Quit (stops the daemon and 2 runs)",
    ]);
    expect(
      labels(
        trayMenuTemplate({
          windowVisible: true,
          status: { kind: "running" },
          activeRuns: 1,
        }),
      )[3],
    ).toBe("Quit (stops the daemon and 1 run)");
  });

  it("shows a starting or failed daemon", () => {
    const base = { windowVisible: true, activeRuns: 0 };
    expect(
      labels(trayMenuTemplate({ ...base, status: { kind: "starting" } }))[1],
    ).toBe("Daemon starting…");
    expect(
      labels(
        trayMenuTemplate({
          ...base,
          status: {
            kind: "failed",
            message: "A standalone daemon is running.",
          },
        }),
      )[1],
    ).toBe("Daemon failed: A standalone daemon is running.");
  });
});
