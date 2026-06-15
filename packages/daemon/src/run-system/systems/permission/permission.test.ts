import { describe, expect, it } from "bun:test";
import type { PermissionRequest } from "@comma-agents/core";
import { createSystemRunContext } from "../systems.test.utils";
import { createPermissionSystem } from "./permission";

const request: PermissionRequest = {
  agentName: "assistant",
  toolName: "write_file",
  operation: "fs.write",
  resource: "/workspace/file.ts",
  reason: "policy-ask",
};

describe("createPermissionSystem", () => {
  it("requests and resolves a permission through the system", async () => {
    const context = createSystemRunContext();
    const system = createPermissionSystem();
    system.onRunPrepare?.(context);

    const requester = context.systemData.get("permissionRequester");
    if (!requester) throw new Error("Permission requester was not registered");

    const result = requester(request);
    const message = context.sink.broadcasts[0]?.message;
    if (message?.type !== "request_permission") {
      throw new Error("Permission request was not broadcast");
    }

    expect(
      context.actions.invoke(
        "resolvePermission",
        context.run.id,
        message.requestId,
        "allow",
      ),
    ).toBe(true);
    expect(await result).toBe("allow");
  });

  it("assigns a unique ID to each pending permission", async () => {
    const context = createSystemRunContext();
    const system = createPermissionSystem();
    system.onRunPrepare?.(context);

    const requester = context.systemData.get("permissionRequester");
    if (!requester) throw new Error("Permission requester was not registered");

    const first = requester(request);
    const second = requester(request);
    const firstMessage = context.sink.broadcasts[0]?.message;
    const secondMessage = context.sink.broadcasts[1]?.message;
    if (
      firstMessage?.type !== "request_permission" ||
      secondMessage?.type !== "request_permission"
    ) {
      throw new Error("Expected two permission requests");
    }

    expect(firstMessage.requestId).not.toBe(secondMessage.requestId);
    context.actions.invoke(
      "resolvePermission",
      context.run.id,
      firstMessage.requestId,
      "allow",
    );
    context.actions.invoke(
      "resolvePermission",
      context.run.id,
      secondMessage.requestId,
      "deny",
    );
    expect(await first).toBe("allow");
    expect(await second).toBe("deny");
  });

  it("rejects pending permissions during cleanup", async () => {
    const context = createSystemRunContext();
    const system = createPermissionSystem();
    system.onRunPrepare?.(context);

    const requester = context.systemData.get("permissionRequester");
    if (!requester) throw new Error("Permission requester was not registered");
    const result = requester(request);

    await system.onRunCleanup?.(context);

    await expect(result).rejects.toThrow("Permission system cleaned up");
  });
});
