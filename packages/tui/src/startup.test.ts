import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

describe("TUI startup", () => {
  it("should load the application and display help without a daemon", () => {
    const result = Bun.spawnSync(
      [process.execPath, "run", "src/main.tsx", "--help"],
      {
        cwd: resolve(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("comma-agents-tui [options]");
    expect(result.stdout.toString()).toContain("--daemon-url");
  });
});
