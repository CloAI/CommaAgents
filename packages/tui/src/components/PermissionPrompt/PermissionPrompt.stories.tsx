import type { RequestPermissionMessage } from "@comma-agents/daemon";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionPrompt } from "./PermissionPrompt";

/**
 * `PermissionPrompt` displays a daemon-issued permission request and
 * collects the user's decision. Tab/Shift+Tab cycle through the four
 * decision buttons; Enter (or click) confirms the focused choice.
 */
const writeRequest: RequestPermissionMessage = {
  type: "request_permission",
  ts: "2026-06-09T12:00:00.000Z",
  requestId: "perm_01HZX9F8Q3K6V5",
  runId: "run_01HZX9F8AB1234",
  agentName: "coder",
  toolName: "edit_file",
  operation: "fs.write",
  resource: "/Users/sam/projects/comma/src/index.ts",
  reason: "policy-ask",
};

const meta: Meta<typeof PermissionPrompt> = {
  title: "Components/PermissionPrompt",
  component: PermissionPrompt,
  args: {
    request: writeRequest,
    onDecide: (decision) => {
      // eslint-disable-next-line no-console
      console.log("[PermissionPrompt] decision:", decision);
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const FsWrite: Story = {};

export const FsRead: Story = {
  args: {
    request: {
      type: "request_permission",
      ts: "2026-06-09T12:00:00.000Z",
      requestId: "perm_03READ",
      runId: "run_03READ",
      agentName: "researcher",
      toolName: "read_file",
      operation: "fs.read",
      resource: "/Users/sam/.aws/credentials",
      reason: "policy-ask",
    },
  },
};

export const FsExecNoTool: Story = {
  args: {
    request: {
      type: "request_permission",
      ts: "2026-06-09T12:00:00.000Z",
      requestId: "perm_02EXEC",
      runId: "run_02EXEC",
      agentName: "shell-runner",
      operation: "fs.exec",
      resource: "git push origin main --force",
      reason: "policy-deny-override",
    },
  },
};
