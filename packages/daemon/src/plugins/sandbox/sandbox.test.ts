import { setTimeout as delay } from "node:timers/promises";
import { RunOutcomeStatus } from "../runs/state/state.schemas";
import { afterEach, describe, expect, vi, test } from "vitest";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import type { Sandbox } from "@comma-agents/core/sandbox";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  createRunDirectory,
} from "../runs/test.utils";
import { createSandboxPlugin } from "./sandbox";
import type {
  SandboxPermissionRequest,
  SandboxStatus,
} from "./sandbox.notifications";

afterEach(cleanupRunFixtures);

function fixture() {
  const sandboxes = new Map<string, Sandbox>();
  const loader = fakeLoader({ loads: [], restored: [] });
  const runs = createMockRunsPlugin({
    runsDir: createRunDirectory(),
    async loadStrategy(options) {
      const sandbox = options.strategyInputs.sandbox;
      if (!sandbox) {
        throw new Error("Sandbox was not supplied to the loader");
      }
      sandboxes.set(options.runId, sandbox);
      return loader(options);
    },
  });
  const sandbox = createSandboxPlugin({ dependencies: { runs } });
  const cwd = realpathSync(directories.at(-1)!);
  return { runs, sandbox, sandboxes, cwd };
}

function requestApproval(
  sandbox: ReturnType<typeof createSandboxPlugin>,
  guardSandbox: Sandbox,
  runId: string,
  signal = new AbortController().signal,
) {
  let receivePermission: (request: SandboxPermissionRequest) => void = () => {};
  const permission = new Promise<SandboxPermissionRequest>((resolve) => {
    receivePermission = resolve;
  });
  let unsubscribe = (): void => {};
  const registration = sandbox.notifications
    .subscribe("run_permission_requested", runId, (request) => {
      receivePermission(request);
    })
    .then((remove) => {
      unsubscribe = remove;
    });
  const authorization = registration.then(() =>
    guardSandbox
      .guardFor("write_file")
      .authorize(
        { type: "fs.write", resource: "output.ts" },
        { agentName: "writer", toolName: "write_file", signal },
      ),
  );
  return { permission, authorization, unsubscribe };
}

describe("sandbox plugin", () => {
  test("should ask for workspace escapes and replay unresolved requests to new listeners", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    let receivePermission: (
      request: SandboxPermissionRequest,
    ) => void = () => {};
    const permission = new Promise<SandboxPermissionRequest>((resolve) => {
      receivePermission = resolve;
    });
    await sandbox.notifications.subscribe(
      "run_permission_requested",
      "root",
      (status) => {
        if (status.type === "run_permission_requested") {
          receivePermission(status);
        }
      },
    );
    const authorization = sandboxes
      .get("root")!
      .guardFor("write_file")
      .authorize(
        { type: "fs.write", resource: "../outside.ts" },
        {
          agentName: "writer",
          toolName: "write_file",
          signal: new AbortController().signal,
        },
      );
    const request = await permission;
    expect(request.resource).toBe(join(cwd, "..", "outside.ts"));
    const replayed: SandboxStatus[] = [];
    await sandbox.notifications.subscribe(
      "run_permission_requested",
      "root",
      (status) => {
        replayed.push(status);
      },
    );
    expect(replayed).toEqual([request]);
    sandbox.resolvePermission("root", request.requestId, "allow");
    expect(await authorization).toBe(request.resource);
    await runs.dispose();
    await sandbox.dispose();
  });

  test("should inject a sandbox and resolve unique requests only for their owning run", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    expect(
      sandbox.updatePolicy(
        "root",
        { mode: "write", default: "ask" },
        "write_file",
      ),
    ).toBe(true);
    const first = requestApproval(sandbox, sandboxes.get("root")!, "root");
    const firstRequest = await first.permission;
    first.unsubscribe();
    const second = requestApproval(sandbox, sandboxes.get("root")!, "root");
    // Subscription replays the first outstanding request; wait for both to be pending.
    await delay(0);
    const pending = sandbox.getPendingPermissions("root");
    expect(pending).toHaveLength(2);
    expect(new Set(pending.map((request) => request.requestId)).size).toBe(2);
    expect(firstRequest).not.toHaveProperty("signal");
    expect(
      sandbox.resolvePermission("wrong-run", firstRequest.requestId, "allow"),
    ).toBe(false);
    for (const request of pending) {
      expect(
        sandbox.resolvePermission("root", request.requestId, "allow"),
      ).toBe(true);
    }
    expect(await first.authorization).toBe(join(cwd, "output.ts"));
    expect(await second.authorization).toBe(join(cwd, "output.ts"));
    expect(
      sandbox.resolvePermission("root", firstRequest.requestId, "allow"),
    ).toBe(false);
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    await runs.dispose();
    await sandbox.dispose();
  });

  test("should enforce deny and keep session decisions in the current execution", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    sandbox.updatePolicy(
      "root",
      { mode: "write", default: "ask" },
      "write_file",
    );
    const denied = requestApproval(sandbox, sandboxes.get("root")!, "root");
    const deniedRequest = await denied.permission;
    sandbox.resolvePermission("root", deniedRequest.requestId, "deny");
    await expect(denied.authorization).rejects.toThrow();
    denied.unsubscribe();
    const allowed = requestApproval(sandbox, sandboxes.get("root")!, "root");
    const allowedRequest = await allowed.permission;
    sandbox.resolvePermission(
      "root",
      allowedRequest.requestId,
      "allow-session",
    );
    await allowed.authorization;
    const next = requestApproval(sandbox, sandboxes.get("root")!, "root");
    expect(await next.authorization).toBe(join(cwd, "output.ts"));
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    await runs.startRun("root").completion;
    await runs.prepareRun({ runId: "root" });
    expect(
      sandboxes
        .get("root")!
        .guardFor("write_file")
        .getPolicies()
        .policies.some((policy) => policy.priority === "session"),
    ).toBe(false);
    await runs.dispose();
    await sandbox.dispose();
  });

  test("should remove tool-aborted permissions without ending the run sandbox", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    sandbox.updatePolicy(
      "root",
      { mode: "write", default: "ask" },
      "write_file",
    );
    const controller = new AbortController();
    const pending = requestApproval(
      sandbox,
      sandboxes.get("root")!,
      "root",
      controller.signal,
    );
    const request = await pending.permission;
    controller.abort();
    await expect(pending.authorization).rejects.toThrow();
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    expect(sandbox.resolvePermission("root", request.requestId, "allow")).toBe(
      false,
    );
    expect(
      sandbox.updatePolicy("root", { mode: "write", default: "allow" }),
    ).toBe(true);
    await runs.dispose();
    await sandbox.dispose();
  });

  test("should reject pending requests and remove scopes when a prepared run stops", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    sandbox.updatePolicy(
      "root",
      { mode: "write", default: "ask" },
      "write_file",
    );
    const pending = requestApproval(sandbox, sandboxes.get("root")!, "root");
    await pending.permission;
    await runs.stopRun("root");
    await expect(pending.authorization).rejects.toThrow();
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    expect(
      sandbox.updatePolicy("root", { mode: "write", default: "allow" }),
    ).toBe(false);
    await sandbox.dispose();
  });

  test("should isolate child policies and clean child resources before the parent completes", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    let childRunId = "";
    runs.registerStrategyHooks({
      name: "child-permission",
      attach(scope) {
        if (!scope.parentRunId) {
          return;
        }
        childRunId = scope.runId;
        const childSandbox = sandboxes.get(childRunId)!;
        sandbox.updatePolicy(
          childRunId,
          { mode: "write", default: "ask" },
          "write_file",
        );
        const call = scope.strategy.flow.call;
        vi.spyOn(scope.strategy.flow, "call").mockImplementation((input) => {
          const flowCall = call(input);
          const authorization = childSandbox.guardFor("write_file").authorize(
            { type: "fs.write", resource: "child.ts" },
            {
              agentName: "writer",
              toolName: "write_file",
              signal: scope.signal,
            },
          );
          return Object.assign(
            Promise.all([authorization, flowCall]).then(([, result]) => result),
            { abort: () => flowCall.abort() },
          );
        });
      },
    });
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    let receivePermission: (
      request: SandboxPermissionRequest,
    ) => void = () => {};
    const permission = new Promise<SandboxPermissionRequest>((resolve) => {
      receivePermission = resolve;
    });
    await sandbox.notifications.subscribe(
      "run_permission_requested",
      "root",
      (status) => {
        if (status.type === "run_permission_requested") {
          receivePermission(status);
        }
      },
    );
    const completion = runs.startRun("root", "child").completion;
    const request = await permission;
    expect(request.runId).toBe(childRunId);
    expect(request.parentRunId).toBe("root");
    expect(sandbox.resolvePermission("root", request.requestId, "allow")).toBe(
      false,
    );
    expect(
      sandbox.updatePolicy(
        "other",
        { mode: "write", default: "allow" },
        "write_file",
      ),
    ).toBe(false);
    expect(
      sandboxes
        .get("root")!
        .guardFor("write_file")
        .canAccess({ type: "fs.write", resource: "child.ts" }),
    ).toBe(true);
    sandbox.resolvePermission(childRunId, request.requestId, "allow");
    expect((await completion).status).toBe(RunOutcomeStatus.completed);
    expect(
      sandbox.updatePolicy(
        childRunId,
        { mode: "write", default: "allow" },
        "write_file",
      ),
    ).toBe(false);
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    await sandbox.dispose();
  });

  test("should deliver nested permissions to the root while resolving each execution separately", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    const requests: SandboxPermissionRequest[] = [];
    await sandbox.notifications.subscribe(
      "run_permission_requested",
      "root",
      (status) => {
        if (status.type !== "run_permission_requested") {
          return;
        }
        requests.push(status);
        expect(sandbox.getPendingPermissions("root")).toContain(status);
        expect(
          sandbox.resolvePermission(status.runId, status.requestId, "allow"),
        ).toBe(true);
      },
    );
    runs.registerStrategyHooks({
      name: "nested-permissions",
      attach(scope) {
        if (!scope.parentRunId) {
          return;
        }
        const guard = sandboxes.get(scope.runId)!.guardFor("write_file");
        sandbox.updatePolicy(
          scope.runId,
          { mode: "write", default: "ask" },
          "write_file",
        );
        const call = scope.strategy.flow.call;
        vi.spyOn(scope.strategy.flow, "call").mockImplementation((input) => {
          const flowCall = call(input);
          const authorization = guard.authorize(
            { type: "fs.write", resource: "output.ts" },
            {
              agentName: "writer",
              toolName: "write_file",
              signal: scope.signal,
            },
          );
          return Object.assign(
            Promise.all([authorization, flowCall]).then(([, result]) => result),
            { abort: () => flowCall.abort() },
          );
        });
      },
    });
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    expect((await runs.startRun("root", "nested").completion).status).toBe(
      RunOutcomeStatus.completed,
    );
    expect(requests).toHaveLength(2);
    const child = requests.find((request) => request.parentRunId === "root")!;
    const grandchild = requests.find(
      (request) => request.parentRunId === child.runId,
    )!;
    expect(
      runs.getRunLineage(grandchild.runId).map((identity) => identity.runId),
    ).toEqual([grandchild.runId, child.runId, "root"]);
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    expect(
      sandbox.updatePolicy(grandchild.runId, {
        mode: "write",
        default: "allow",
      }),
    ).toBe(false);
    await runs.dispose();
    await sandbox.dispose();
  });

  test("should cancel a grandchild permission when its root run stops", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    runs.registerStrategyHooks({
      name: "grandchild-permission",
      attach(scope) {
        if (runs.getRunLineage(scope.runId).length !== 3) {
          return;
        }
        sandbox.updatePolicy(
          scope.runId,
          { mode: "write", default: "ask" },
          "write_file",
        );
        const call = scope.strategy.flow.call;
        vi.spyOn(scope.strategy.flow, "call").mockImplementation((input) => {
          const flowCall = call(input);
          const pending = requestApproval(
            sandbox,
            sandboxes.get(scope.runId)!,
            scope.runId,
            scope.signal,
          );
          return Object.assign(
            Promise.all([pending.authorization, flowCall]).then(
              ([, result]) => result,
            ),
            { abort: () => flowCall.abort() },
          );
        });
      },
    });
    let receivePermission: (
      request: SandboxPermissionRequest,
    ) => void = () => {};
    const permission = new Promise<SandboxPermissionRequest>((resolve) => {
      receivePermission = resolve;
    });
    await sandbox.notifications.subscribe(
      "run_permission_requested",
      "root",
      (status) => {
        if (status.type === "run_permission_requested") {
          receivePermission(status);
        }
      },
    );
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const completion = runs.startRun("root", "nested").completion;
    const request = await permission;
    await runs.stopRun("root");
    expect((await completion).status).toBe(RunOutcomeStatus.stopped);
    expect(await runs.getRun(request.runId)).toMatchObject({
      outcome: { status: "stopped" },
    });
    expect(await runs.getRun(request.parentRunId!)).toMatchObject({
      outcome: { status: "stopped" },
    });
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    expect(
      sandbox.resolvePermission(request.runId, request.requestId, "allow"),
    ).toBe(false);
    expect(
      sandbox.updatePolicy(request.runId, { mode: "write", default: "allow" }),
    ).toBe(false);
    await runs.dispose();
    await sandbox.dispose();
  });

  test("should stop running execution while it is waiting for permission", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    runs.registerStrategyHooks({
      name: "blocking-permission",
      attach(scope) {
        const guard = sandboxes.get(scope.runId)!.guardFor("write_file");
        sandbox.updatePolicy(
          scope.runId,
          { mode: "write", default: "ask" },
          "write_file",
        );
        const call = scope.strategy.flow.call;
        vi.spyOn(scope.strategy.flow, "call").mockImplementation((input) => {
          const flowCall = call(input);
          const authorization = guard.authorize(
            { type: "fs.write", resource: "output.ts" },
            {
              agentName: "writer",
              toolName: "write_file",
              signal: scope.signal,
            },
          );
          return Object.assign(
            Promise.all([authorization, flowCall]).then(([, result]) => result),
            { abort: () => flowCall.abort() },
          );
        });
      },
    });
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    let receivePermission: (
      request: SandboxPermissionRequest,
    ) => void = () => {};
    const permission = new Promise<SandboxPermissionRequest>((resolve) => {
      receivePermission = resolve;
    });
    await sandbox.notifications.subscribe(
      "run_permission_requested",
      "root",
      (status) => {
        if (status.type === "run_permission_requested") {
          receivePermission(status);
        }
      },
    );
    const completion = runs.startRun("root").completion;
    const request = await permission;
    await runs.stopRun("root");
    expect((await completion).status).toBe(RunOutcomeStatus.stopped);
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    expect(sandbox.resolvePermission("root", request.requestId, "allow")).toBe(
      false,
    );
    expect(
      sandbox.updatePolicy("root", { mode: "write", default: "allow" }),
    ).toBe(false);
    await sandbox.dispose();
  });

  test("should deliver policy changes, isolate listeners, and honor unsubscribe", async () => {
    const { runs, sandbox, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    await sandbox.notifications.subscribe("run_policy_updated", "root", () => {
      throw new Error("listener failed");
    });
    const updates: SandboxStatus[] = [];
    const unsubscribe = await sandbox.notifications.subscribe(
      "run_policy_updated",
      "root",
      (status) => {
        updates.push(status);
      },
    );
    sandbox.updatePolicy(
      "root",
      { mode: "write", default: "deny" },
      "write_file",
    );
    expect(updates.at(-1)).toMatchObject({
      type: "run_policy_updated",
      runId: "root",
      tool: "write_file",
    });
    const count = updates.length;
    unsubscribe();
    sandbox.updatePolicy(
      "root",
      { mode: "write", default: "allow" },
      "write_file",
    );
    expect(updates).toHaveLength(count);
    await runs.dispose();
    await sandbox.dispose();
  });

  test("should clean up once and reject future scope preparation after disposal", async () => {
    const { runs, sandbox, sandboxes, cwd } = fixture();
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    sandbox.updatePolicy(
      "root",
      { mode: "write", default: "ask" },
      "write_file",
    );
    const pending = requestApproval(sandbox, sandboxes.get("root")!, "root");
    await pending.permission;
    const first = sandbox.dispose();
    expect(sandbox.dispose()).toBe(first);
    await first;
    await expect(pending.authorization).rejects.toThrow();
    expect(sandbox.getPendingPermissions("root")).toEqual([]);
    await expect(
      sandbox.notifications.subscribe(
        "run_permission_requested",
        "root",
        () => {},
      ),
    ).rejects.toThrow("disposed");
    await expect(
      runs.prepareRun({
        runId: "later",
        configuration: {
          strategyPath: "example.json",
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    await runs.dispose();
  });

  test("should release sandbox resources when a later preparation provider fails", async () => {
    const { runs, sandbox, cwd } = fixture();
    runs.registerRunPreparation({
      name: "failed",
      prepare() {
        throw new Error("provider failed");
      },
    });
    await expect(
      runs.prepareRun({
        runId: "root",
        configuration: {
          strategyPath: "example.json",
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    expect(
      sandbox.updatePolicy("root", { mode: "write", default: "allow" }),
    ).toBe(false);
    await sandbox.dispose();
  });
});
