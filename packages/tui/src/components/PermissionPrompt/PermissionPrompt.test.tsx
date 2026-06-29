import { describe, expect, it } from "bun:test";
import type { RequestPermissionMessage } from "@comma-agents/daemon";
import { render } from "ink-testing-library";
import { PermissionPrompt } from "./PermissionPrompt";

function createRequest(
  operation: RequestPermissionMessage["operation"],
  toolName?: string,
): RequestPermissionMessage {
  return {
    type: "request_permission",
    ts: "2026-06-25T00:00:00.000Z",
    requestId: `permission-${operation}`,
    runId: "run-1",
    agentName: "coder",
    ...(toolName !== undefined ? { toolName } : {}),
    operation,
    resource: "/workspace/file.ts",
    reason: "policy-ask",
  };
}

describe("PermissionPrompt", () => {
  it.each([
    ["fs.read", "read"],
    ["fs.write", "write"],
    ["fs.exec", "execute"],
  ] as const)("renders the %s operation clearly", (operation, label) => {
    const { lastFrame } = render(
      <PermissionPrompt
        request={createRequest(operation, "read_file")}
        onDecide={() => {}}
      />,
    );

    expect(lastFrame()).toContain(`wants to ${label}:`);
    expect(lastFrame()).toContain("/workspace/file.ts");
    expect(lastFrame()).toMatchSnapshot();
  });

  it("renders an agent without a tool name", () => {
    const { lastFrame } = render(
      <PermissionPrompt
        request={createRequest("fs.exec")}
        onDecide={() => {}}
      />,
    );

    expect(lastFrame()).toContain("coder");
    expect(lastFrame()).not.toContain("coder (");
  });
});
