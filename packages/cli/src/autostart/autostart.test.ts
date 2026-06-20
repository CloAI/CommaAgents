import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { buildAutostartPlan } from "./autostart";

describe("buildAutostartPlan", () => {
  it("should build a launchd plan for macOS", () => {
    const plan = buildAutostartPlan({
      platform: "darwin",
      commaPath: "/usr/local/bin/comma",
      homeDir: "/Users/tester",
    });

    expect(plan.supported).toBe(true);
    expect(plan.description).toBe("macOS launchd user agent");
    expect(plan.enableActions[0]).toEqual({
      type: "write-file",
      path: "/Users/tester/Library/LaunchAgents/com.comma-agents.daemon.plist",
      content: expect.stringContaining("/usr/local/bin/comma"),
    });
  });

  it("should build a systemd user plan for Linux", () => {
    const plan = buildAutostartPlan({
      platform: "linux",
      commaPath: "/home/tester/.local/bin/comma",
      homeDir: "/home/tester",
    });

    expect(plan.supported).toBe(true);
    expect(plan.enableActions[0]).toEqual({
      type: "write-file",
      path: join(
        "/home/tester",
        ".config",
        "systemd",
        "user",
        "comma-agents.service",
      ),
      content: expect.stringContaining(
        "/home/tester/.local/bin/comma daemon start --foreground",
      ),
    });
  });

  it("should build a scheduled task plan for Windows", () => {
    const plan = buildAutostartPlan({
      platform: "win32",
      commaPath: "C:\\Users\\tester\\AppData\\Local\\comma\\comma.exe",
    });

    expect(plan.supported).toBe(true);
    expect(plan.enableActions[0]).toEqual({
      type: "run-command",
      command: [
        "schtasks",
        "/Create",
        "/TN",
        "CommaAgentsDaemon",
        "/SC",
        "ONLOGON",
        "/TR",
        '"C:\\Users\\tester\\AppData\\Local\\comma\\comma.exe" daemon start --foreground',
        "/F",
      ],
    });
  });

  it("should return lazy startup for unsupported platforms", () => {
    const plan = buildAutostartPlan({ platform: "freebsd" });

    expect(plan.supported).toBe(false);
    expect(plan.enableActions).toEqual([]);
    expect(plan.description).toBe("Lazy daemon startup only");
  });
});
