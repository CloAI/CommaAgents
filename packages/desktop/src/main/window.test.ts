import { describe, expect, it, vi } from "vitest";

// The window module imports Electron's runtime; only its pure helper is under test.
vi.mock("electron", () => ({ BrowserWindow: {}, screen: {}, shell: {} }));

const { parseWindowCommand, trustedUrlChecker } = await import("./window");

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
