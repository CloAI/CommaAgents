import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

describe("TUI startup", () => {
  it("should load the application and display help without a daemon", () => {
    const result = spawnSync(
      process.execPath, ["--import", "tsx", "src/main.tsx", "--help"],
      {
        cwd: resolve(import.meta.dirname, ".."),
        stdio: "pipe",
      },
    );

    expect(result.stderr.toString()).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toContain("comma-agents-tui [options]");
    expect(result.stdout.toString()).toContain("--daemon-url");
  });
});
