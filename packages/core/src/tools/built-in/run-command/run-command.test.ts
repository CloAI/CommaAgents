import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../sandbox/sandbox";
import { makeToolContext } from "../../test.utils";
import type { PlatformInfo } from "./index";
import { createRunCommandTool } from "./index";

const POSIX_PLATFORM: PlatformInfo = {
  platform: "linux",
  osName: "Linux",
  osRelease: "test",
  arch: "x64",
  shellPath: "/bin/sh",
  shellFlag: "-c",
  runtime: "test 1.0.0",
};

async function makeWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "run-command-test-"));
}

describe("run_command", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await makeWorkspace();
  });
  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("captures stdout from a simple echo", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "echo hello-world" },
      toolContext,
    );
    expect(result.ok).toBe(true);
    expect(result.data?.exitCode).toBe(0);
    expect(result.data?.stdout.trim()).toBe("hello-world");
    expect(result.data?.stderr).toBe("");
    expect(result.data?.timedOut).toBe(false);
    expect(result.data?.stdoutTruncated).toBe(false);
    expect(result.data?.platform.shellPath).toBe("/bin/sh");
  });

  it("captures stderr separately from stdout", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "echo on-stdout; echo on-stderr 1>&2" },
      toolContext,
    );
    expect(result.ok).toBe(true);
    expect(result.data?.stdout.trim()).toBe("on-stdout");
    expect(result.data?.stderr.trim()).toBe("on-stderr");
  });

  it("reports non-zero exit codes via data.exitCode but ok stays true", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute({ command: "exit 7" }, toolContext);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data?.exitCode).toBe(7);
  });

  it("honors cwd inside the workspace", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "pwd", cwd: "." },
      toolContext,
    );
    expect(result.ok).toBe(true);
    expect(result.data?.cwd.endsWith(workspace.split("/").pop() ?? "x")).toBe(
      true,
    );
  });

  it("rejects cwd outside the workspace with outside_workspace", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "pwd", cwd: "../../../" },
      toolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("outside_workspace");
  });

  it("rejects commands matching the default deny list", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const sandbox = createSandbox({ cwd: workspace, jail: true });
    const guard = sandbox.guardFor("run_command", tool.policies);
    const result = await tool.execute(
      { command: "rm -rf /" },
      makeToolContext({ guard }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
  });

  it("allows commands when deny list is empty", async () => {
    const tool = createRunCommandTool({
      platformInfo: POSIX_PLATFORM,
      denyPatterns: [],
    });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "echo would-have-been-denied" },
      toolContext,
    );
    expect(result.ok).toBe(true);
  });

  it("blocks approval-required commands when no requester is configured", async () => {
    const tool = createRunCommandTool({
      platformInfo: POSIX_PLATFORM,
      requireApprovalPatterns: [/pretend-dangerous/],
    });
    const sandbox = createSandbox({ cwd: workspace, jail: true });
    const guard = sandbox.guardFor("run_command", tool.policies);
    const result = await tool.execute(
      { command: "echo pretend-dangerous" },
      makeToolContext({ guard }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
  });

  it("routes approval-required commands through the requester (allow)", async () => {
    let requesterCalls = 0;
    const tool = createRunCommandTool({
      platformInfo: POSIX_PLATFORM,
      requireApprovalPatterns: [/needs-approval/],
      requestPermission: async (req) => {
        requesterCalls += 1;
        expect(req.operation).toBe("fs.exec");
        expect(req.toolName).toBe("run_command");
        return "allow";
      },
    });
    const sandbox = createSandbox({ cwd: workspace, jail: true }, {
      onAsk: async (req) => {
        requesterCalls += 1;
        expect(req.operation).toBe("command.execute");
        expect(req.toolName).toBe("run_command");
        return "allow";
      },
    });
    const guard = sandbox.guardFor("run_command", tool.policies);
    const result = await tool.execute(
      { command: "echo needs-approval-ok" },
      makeToolContext({ guard }),
    );
    expect(requesterCalls).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.data?.stdout.trim()).toBe("needs-approval-ok");
  });

  it("routes approval-required commands through the requester (deny)", async () => {
    const tool = createRunCommandTool({
      platformInfo: POSIX_PLATFORM,
      requireApprovalPatterns: [/needs-approval/],
      requestPermission: async () => "deny",
    });
    const sandbox = createSandbox({ cwd: workspace, jail: true }, {
      onAsk: async () => "deny",
    });
    const guard = sandbox.guardFor("run_command", tool.policies);
    const result = await tool.execute(
      { command: "echo needs-approval bad" },
      makeToolContext({ guard }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("permission_denied");
  });

  it("times out long-running commands and marks timedOut", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "sleep 5", timeoutMs: 100 },
      toolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("timeout");
    expect(result.data?.timedOut).toBe(true);
  });

  it("preserves partial stdout on timeout", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "echo partial; sleep 5", timeoutMs: 300 },
      toolContext,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("timeout");
    expect(result.data?.stdout).toContain("partial");
  });

  it("merges supplied env onto the parent environment", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      {
        command: "printf '%s' \"$RUN_COMMAND_TEST_VAR\"",
        env: { RUN_COMMAND_TEST_VAR: "injected" },
      },
      toolContext,
    );
    expect(result.ok).toBe(true);
    expect(result.data?.stdout).toBe("injected");
  });

  it("truncates stdout when it exceeds the cap", async () => {
    const tool = createRunCommandTool({
      platformInfo: POSIX_PLATFORM,
      maxStdoutBytes: 64,
    });
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
    });
    const result = await tool.execute(
      { command: "yes hello 2>/dev/null | head -c 4096" },
      toolContext,
    );
    expect(result.ok).toBe(true);
    expect(result.data?.stdoutTruncated).toBe(true);
    expect(result.data?.stdout).toContain("…[output truncated by run_command]");
  });

  it("returns command_failed if aborted before start", async () => {
    const tool = createRunCommandTool({ platformInfo: POSIX_PLATFORM });
    const ac = new AbortController();
    ac.abort();
    const toolContext = makeToolContext({
      sandbox: createSandbox({ cwd: workspace, jail: true }),
      abort: ac.signal,
    });
    const result = await tool.execute({ command: "echo never" }, toolContext);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("command_failed");
  });

  it("description includes the detected platform info", () => {
    const tool = createRunCommandTool({
      platformInfo: {
        platform: "darwin",
        osName: "macOS",
        osRelease: "24.0.0",
        arch: "arm64",
        shellPath: "/bin/zsh",
        shellFlag: "-c",
        runtime: "bun 1.2.3",
      },
    });
    expect(tool.description).toContain("macOS 24.0.0");
    expect(tool.description).toContain("arm64");
    expect(tool.description).toContain("/bin/zsh -c");
    expect(tool.description).toContain("bun 1.2.3");
  });

  it("auto-detects platform when no override is supplied", () => {
    const tool = createRunCommandTool();
    expect(tool.description).toContain(
      process.platform === "darwin" ? "macOS" : "",
    );
    expect(tool.description.toLowerCase()).toContain("host:");
    expect(tool.description.toLowerCase()).toContain("shell:");
  });
});
