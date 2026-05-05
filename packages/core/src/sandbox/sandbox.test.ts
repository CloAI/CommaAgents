import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { describe, expect, it, mock } from "bun:test";
import { SandboxViolationError } from "../errors/index";
import { createSandbox } from "./sandbox";

// Resolve real path of /tmp so macOS /tmp → /private/tmp symlink is handled
const TEST_CWD = `${realpathSync("/tmp")}/sandbox-test`;

describe("createSandbox", () => {
  describe("cwd", () => {
    it("should default to process.cwd() when no cwd is provided", () => {
      const sandbox = createSandbox();
      expect(sandbox.cwd).toBe(resolve(process.cwd()));
    });

    it("should resolve the provided cwd to an absolute path", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      expect(sandbox.cwd).toBe(TEST_CWD);
    });
  });

  describe("resolvePath", () => {
    it("should resolve relative paths against cwd", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      expect(sandbox.resolvePath("src/index.ts")).toBe(`${TEST_CWD}${sep}src${sep}index.ts`);
    });

    it("should resolve absolute paths as-is when jail is off", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD, jail: false });
      expect(sandbox.resolvePath("/etc/hosts")).toBe("/etc/hosts");
    });

    it("should throw SandboxViolationError with reason 'jail' on escape when jail is on", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD, jail: true });
      expect(() => sandbox.resolvePath("../../etc/hosts")).toThrow(SandboxViolationError);

      try {
        sandbox.resolvePath("../../etc/hosts");
      } catch (sandboxError) {
        expect(sandboxError).toBeInstanceOf(SandboxViolationError);
        expect((sandboxError as SandboxViolationError).reason).toBe("jail");
      }
    });

    it("should allow paths inside cwd when jail is on", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD, jail: true });
      const resolved = sandbox.resolvePath("subdir/file.txt");
      expect(resolved).toBe(`${TEST_CWD}${sep}subdir${sep}file.txt`);
    });

    it("should allow cwd itself when jail is on", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD, jail: true });
      expect(sandbox.resolvePath(".")).toBe(TEST_CWD);
    });
  });

  describe("canRead / canWrite", () => {
    it("should return true for all paths when policy is allow-all", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      expect(sandbox.canRead(`${TEST_CWD}/file.txt`)).toBe(true);
      expect(sandbox.canWrite(`${TEST_CWD}/file.txt`)).toBe(true);
    });

    it("should return false for denied paths", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "allow", deny: ["secrets/**"] },
        write: { default: "allow", deny: ["secrets/**"] },
      });
      expect(sandbox.canRead(`${TEST_CWD}/secrets/key.txt`)).toBe(false);
      expect(sandbox.canWrite(`${TEST_CWD}/secrets/key.txt`)).toBe(false);
    });

    it("should return false for paths outside cwd when jail is on", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD, jail: true });
      expect(sandbox.canRead("/etc/hosts")).toBe(false);
    });

    it("should not throw — returns false on jail violation", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD, jail: true });
      expect(() => sandbox.canRead("../../escape")).not.toThrow();
      expect(sandbox.canRead("../../escape")).toBe(false);
    });

    it("should return false for 'ask' decisions (non-throwing)", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "ask" },
      });
      expect(sandbox.canRead(`${TEST_CWD}/anything.txt`)).toBe(false);
    });
  });

  describe("assertReadable / assertWritable", () => {
    it("should return the resolved absolute path when allowed", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      const result = sandbox.assertReadable("src/index.ts");
      expect(result).toBe(`${TEST_CWD}${sep}src${sep}index.ts`);
    });

    it("should throw SandboxViolationError with reason 'read-denied' when read is denied", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "deny" },
      });
      expect(() => sandbox.assertReadable("file.txt")).toThrow(SandboxViolationError);

      try {
        sandbox.assertReadable("file.txt");
      } catch (sandboxError) {
        expect((sandboxError as SandboxViolationError).reason).toBe("read-denied");
      }
    });

    it("should throw SandboxViolationError with reason 'write-denied' when write is denied", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        write: { default: "deny" },
      });
      expect(() => sandbox.assertWritable("file.txt")).toThrow(SandboxViolationError);

      try {
        sandbox.assertWritable("file.txt");
      } catch (sandboxError) {
        expect((sandboxError as SandboxViolationError).reason).toBe("write-denied");
      }
    });

    it("should throw 'read-denied' for 'ask' policy (sync methods don't prompt)", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "ask" },
      });
      expect(() => sandbox.assertReadable("file.txt")).toThrow(SandboxViolationError);
    });
  });

  describe("policy evaluation — deny > allow > default", () => {
    it("should deny when path matches both allow and deny patterns", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: {
          default: "deny",
          allow: ["src/**"],
          deny: ["src/secrets/**"],
        },
      });
      expect(sandbox.canRead(`${TEST_CWD}/src/index.ts`)).toBe(true);
      expect(sandbox.canRead(`${TEST_CWD}/src/secrets/key.ts`)).toBe(false);
    });

    it("should use default when no pattern matches", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "deny", allow: ["src/**"] },
      });
      expect(sandbox.canRead(`${TEST_CWD}/dist/bundle.js`)).toBe(false);
    });

    it("should allow explicitly listed paths when default is deny", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        write: { default: "deny", allow: ["output/**"] },
      });
      expect(sandbox.canWrite(`${TEST_CWD}/output/report.txt`)).toBe(true);
      expect(sandbox.canWrite(`${TEST_CWD}/src/main.ts`)).toBe(false);
    });
  });

  describe("authorizeRead / authorizeWrite", () => {
    const authorizationContext = {
      agentName: "test-agent",
      toolName: "read",
      signal: AbortSignal.timeout(5_000),
    };

    it("should resolve the absolute path when policy is allow", async () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      const result = await sandbox.authorizeRead("file.txt", authorizationContext);
      expect(result).toBe(`${TEST_CWD}${sep}file.txt`);
    });

    it("should throw SandboxViolationError when policy is deny", async () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "deny" },
      });
      await expect(sandbox.authorizeRead("file.txt", authorizationContext)).rejects.toThrow(
        SandboxViolationError,
      );
    });

    it("should throw 'ask-no-handler' when policy is 'ask' and no requester is set", async () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "ask" },
      });

      try {
        await sandbox.authorizeRead("file.txt", authorizationContext);
        expect(true).toBe(false); // should not reach here
      } catch (sandboxError) {
        expect(sandboxError).toBeInstanceOf(SandboxViolationError);
        expect((sandboxError as SandboxViolationError).reason).toBe("ask-no-handler");
      }
    });

    it("should call PermissionRequester with correct fields when policy is 'ask'", async () => {
      const decisions: string[] = [];
      const requester = mock(async () => {
        decisions.push("called");
        return "allow" as const;
      });

      const sandbox = createSandbox(
        { cwd: TEST_CWD, read: { default: "ask" } },
        { requestPermission: requester },
      );

      await sandbox.authorizeRead("file.txt", authorizationContext);
      expect(decisions).toEqual(["called"]);
      expect(requester).toHaveBeenCalledTimes(1);

      const callArg = requester.mock.calls[0]?.[0] as { operation: string; resource: string; agentName: string };
      expect(callArg.operation).toBe("fs.read");
      expect(callArg.resource).toBe(`${TEST_CWD}${sep}file.txt`);
      expect(callArg.agentName).toBe("test-agent");
    });

    it("should throw 'read-denied' when requester returns 'deny'", async () => {
      const sandbox = createSandbox(
        { cwd: TEST_CWD, read: { default: "ask" } },
        { requestPermission: async () => "deny" },
      );

      try {
        await sandbox.authorizeRead("file.txt", authorizationContext);
        expect(true).toBe(false);
      } catch (sandboxError) {
        expect((sandboxError as SandboxViolationError).reason).toBe("read-denied");
      }
    });

    it("should throw 'ask-aborted' when requester throws", async () => {
      const sandbox = createSandbox(
        { cwd: TEST_CWD, read: { default: "ask" } },
        {
          requestPermission: async () => {
            throw new Error("User closed the dialog");
          },
        },
      );

      try {
        await sandbox.authorizeRead("file.txt", authorizationContext);
        expect(true).toBe(false);
      } catch (sandboxError) {
        expect((sandboxError as SandboxViolationError).reason).toBe("ask-aborted");
      }
    });
  });

  describe("allow-session / deny-session memory", () => {
    const authorizationContext = {
      agentName: "test-agent",
      toolName: "write",
      signal: AbortSignal.timeout(5_000),
    };

    it("should remember allow-session and skip requester on subsequent calls", async () => {
      let callCount = 0;
      const sandbox = createSandbox(
        { cwd: TEST_CWD, write: { default: "ask" } },
        {
          requestPermission: async () => {
            callCount++;
            return "allow-session";
          },
        },
      );

      await sandbox.authorizeWrite("output.txt", authorizationContext);
      await sandbox.authorizeWrite("output.txt", authorizationContext);
      expect(callCount).toBe(1);
    });

    it("should remember deny-session and deny subsequent calls without prompting", async () => {
      let callCount = 0;
      const sandbox = createSandbox(
        { cwd: TEST_CWD, write: { default: "ask" } },
        {
          requestPermission: async () => {
            callCount++;
            return "deny-session";
          },
        },
      );

      try {
        await sandbox.authorizeWrite("output.txt", authorizationContext);
      } catch {
        // expected
      }

      try {
        await sandbox.authorizeWrite("output.txt", authorizationContext);
      } catch {
        // expected
      }

      expect(callCount).toBe(1);
    });
  });

  describe("updatePolicy", () => {
    it("should add allow patterns to the existing policy", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        write: { default: "deny" },
      });

      expect(sandbox.canWrite(`${TEST_CWD}/output/report.txt`)).toBe(false);
      sandbox.updatePolicy({ mode: "write", allow: ["output/**"] });
      expect(sandbox.canWrite(`${TEST_CWD}/output/report.txt`)).toBe(true);
    });

    it("should update the default decision when provided", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "allow" },
      });

      expect(sandbox.canRead(`${TEST_CWD}/file.txt`)).toBe(true);
      sandbox.updatePolicy({ mode: "read", default: "deny" });
      expect(sandbox.canRead(`${TEST_CWD}/file.txt`)).toBe(false);
    });

    it("should preserve existing patterns when adding new ones", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "deny", allow: ["src/**"] },
      });

      sandbox.updatePolicy({ mode: "read", allow: ["docs/**"] });
      expect(sandbox.canRead(`${TEST_CWD}/src/index.ts`)).toBe(true);
      expect(sandbox.canRead(`${TEST_CWD}/docs/readme.md`)).toBe(true);
    });
  });

  describe("getPolicy", () => {
    it("should return the current in-memory policy snapshot", () => {
      const sandbox = createSandbox({
        cwd: TEST_CWD,
        read: { default: "deny", allow: ["src/**"] },
        write: { default: "allow" },
      });

      const policy = sandbox.getPolicy();
      expect(policy.read.default).toBe("deny");
      expect(policy.read.allow).toEqual(["src/**"]);
      expect(policy.write.default).toBe("allow");
    });

    it("should reflect updatePolicy mutations", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      sandbox.updatePolicy({ mode: "write", deny: ["secrets/**"] });

      const policy = sandbox.getPolicy();
      expect(policy.write.deny).toContain("secrets/**");
    });
  });

  describe("onPolicyChange", () => {
    it("should call listener when updatePolicy is called", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      const snapshots: string[] = [];

      sandbox.onPolicyChange((snapshot) => {
        snapshots.push(snapshot.write.default);
      });

      sandbox.updatePolicy({ mode: "write", default: "deny" });
      expect(snapshots).toEqual(["deny"]);
    });

    it("should stop notifying after the unsubscribe function is called", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      const calls: number[] = [];

      const unsubscribe = sandbox.onPolicyChange(() => calls.push(1));
      sandbox.updatePolicy({ mode: "read", default: "deny" });
      unsubscribe();
      sandbox.updatePolicy({ mode: "read", default: "allow" });

      expect(calls).toHaveLength(1);
    });

    it("should support multiple independent listeners", () => {
      const sandbox = createSandbox({ cwd: TEST_CWD });
      const firstCalls: string[] = [];
      const secondCalls: string[] = [];

      sandbox.onPolicyChange((snapshot) => firstCalls.push(snapshot.read.default));
      sandbox.onPolicyChange((snapshot) => secondCalls.push(snapshot.read.default));

      sandbox.updatePolicy({ mode: "read", default: "deny" });

      expect(firstCalls).toEqual(["deny"]);
      expect(secondCalls).toEqual(["deny"]);
    });
  });
});
