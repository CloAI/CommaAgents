import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxViolationError } from "../errors";
import { approveCommandsPolicy } from "../guard/policies";
import { createSandbox } from "./sandbox";

describe("createSandbox", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  async function createTemporaryDirectory(prefix: string): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), prefix));
    temporaryDirectories.push(path);
    return path;
  }

  it("should remember session decisions before default path policies", async () => {
    const workspace = await createTemporaryDirectory(
      "comma-sandbox-workspace-",
    );
    const external = await createTemporaryDirectory("comma-sandbox-external-");
    let requestCount = 0;
    const sandbox = createSandbox(
      {
        cwd: workspace,
        absolutePaths: "allow",
        outsideWorkspace: "ask",
      },
      {
        onAsk: async () => {
          requestCount += 1;
          return "allow-session";
        },
      },
    );
    const guard = sandbox.guardFor("read_file");
    const context = {
      agentName: "reader",
      toolName: "read_file",
      signal: AbortSignal.timeout(5_000),
    };

    await guard.authorize({ type: "fs.read", resource: external }, context);
    await guard.authorize({ type: "fs.read", resource: external }, context);

    expect(requestCount).toBe(1);
  });

  it("should keep one-shot decisions scoped to one authorization", async () => {
    const workspace = await createTemporaryDirectory(
      "comma-sandbox-workspace-",
    );
    const external = await createTemporaryDirectory("comma-sandbox-external-");
    let requestCount = 0;
    const sandbox = createSandbox(
      {
        cwd: workspace,
        absolutePaths: "allow",
        outsideWorkspace: "ask",
      },
      {
        onAsk: async () => {
          requestCount += 1;
          return "allow";
        },
      },
    );
    const guard = sandbox.guardFor("read_file");
    const context = {
      agentName: "reader",
      toolName: "read_file",
      signal: AbortSignal.timeout(5_000),
    };

    await guard.authorize({ type: "fs.read", resource: external }, context);
    await guard.authorize({ type: "fs.read", resource: external }, context);

    expect(requestCount).toBe(2);
  });

  it("should remember command approvals ahead of approval policies", async () => {
    const workspace = await createTemporaryDirectory(
      "comma-sandbox-workspace-",
    );
    let requestCount = 0;
    const sandbox = createSandbox(
      { cwd: workspace },
      {
        onAsk: async () => {
          requestCount += 1;
          return "allow-session";
        },
      },
    );
    const guard = sandbox.guardFor("run_command", [
      approveCommandsPolicy([/git push/]),
    ]);
    const context = {
      agentName: "runner",
      toolName: "run_command",
      signal: AbortSignal.timeout(5_000),
    };
    const request = { type: "command.execute" as const, resource: "git push" };

    await guard.authorize(request, context);
    await guard.authorize(request, context);

    expect(requestCount).toBe(1);
  });

  it("should apply global policy updates to guards created later", async () => {
    const workspace = await createTemporaryDirectory(
      "comma-sandbox-workspace-",
    );
    const sandbox = createSandbox({ cwd: workspace });

    sandbox.updatePolicy({ mode: "read", default: "deny" });
    const guard = sandbox.guardFor("read_file");

    await expect(
      guard.authorize(
        { type: "fs.read", resource: "README.md" },
        {
          agentName: "reader",
          toolName: "read_file",
          signal: AbortSignal.timeout(5_000),
        },
      ),
    ).rejects.toBeInstanceOf(SandboxViolationError);
  });

  it("should preserve tool policy overrides after global updates", async () => {
    const workspace = await createTemporaryDirectory(
      "comma-sandbox-workspace-",
    );
    const sandbox = createSandbox({ cwd: workspace });
    const guard = sandbox.guardFor("read_file");
    const context = {
      agentName: "reader",
      toolName: "read_file",
      signal: AbortSignal.timeout(5_000),
    };

    sandbox.updatePolicy({ mode: "read", default: "deny" }, "read_file");
    sandbox.updatePolicy({ mode: "read", default: "allow" });

    await expect(
      guard.authorize({ type: "fs.read", resource: "README.md" }, context),
    ).rejects.toBeInstanceOf(SandboxViolationError);
  });

  it("should resolve symlinks before enforcing the workspace boundary", async () => {
    const workspace = await createTemporaryDirectory(
      "comma-sandbox-workspace-",
    );
    const external = await createTemporaryDirectory("comma-sandbox-external-");
    await symlink(external, join(workspace, "external"));
    const sandbox = createSandbox({
      cwd: workspace,
      outsideWorkspace: "deny",
    });

    await expect(
      sandbox.guardFor("read_file").authorize(
        { type: "fs.read", resource: "external/secret.txt" },
        {
          agentName: "reader",
          toolName: "read_file",
          signal: AbortSignal.timeout(5_000),
        },
      ),
    ).rejects.toMatchObject({ reason: "jail" });
  });
});
