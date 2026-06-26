import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moveToTrash, trashWorkspaceDir } from "@comma-agents/core";
import type { HubManager, InstalledHubPackage } from "@comma-agents/core/hub";
import { createRunSystem, type RunSystem } from "../../../run-system";
import { createDaemonState } from "../../../state";
import { mockLogger, mockSink } from "../../../test.utils";
import type { HandlerContext, RequestResponseMap } from "../dispatcher.types";
import type { DaemonMessage } from "../messages";
import { handleGetAvailableModels } from "./get-available-models";
import {
  handleHubInstall,
  handleHubList,
  handleHubRemove,
  handleHubUpdate,
} from "./hub-packages";
import { handleListMcpServers } from "./list-mcp-servers";
import { handleListProviders } from "./list-providers";
import { handlePermissionDecision } from "./permission-decision";
import { handleQuestionResponse } from "./question-response";
import { handleSteerRun } from "./steer-run";
import { handleTrashClear } from "./trash-clear";
import { handleTrashList } from "./trash-list";
import { handleTrashRestore } from "./trash-restore";
import { handleUpdateMcpServer } from "./update-mcp-server";
import { handleUpdatePolicy } from "./update-policy";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createTestRunSystem(): Promise<RunSystem> {
  const runsDir = await mkdtemp(join(tmpdir(), "comma-handler-tests-"));
  tempDirs.push(runsDir);
  return createRunSystem({
    state: createDaemonState(),
    sink: mockSink(),
    logger: mockLogger(),
    runsDir,
  });
}

function createContext<RequestType extends keyof RequestResponseMap>(
  runSystem: RunSystem,
  replies: DaemonMessage[],
  hubManager?: HubManager,
): HandlerContext<RequestType> {
  return {
    clientId: "client-1",
    runSystem,
    state: createDaemonState(),
    logger: mockLogger(),
    ...(hubManager !== undefined ? { hubManager } : {}),
    reply(message) {
      replies.push(message);
    },
  };
}

describe("action request handlers", () => {
  it("routes permission decisions through the canonical run action", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];
    let received: readonly string[] = [];
    runSystem.actions.register(
      "resolvePermission",
      "run-1",
      (requestId, decision) => {
        received = [requestId, decision];
        return true;
      },
    );

    handlePermissionDecision(
      {
        type: "permission_decision",
        runId: "run-1",
        permissionRequestId: "permission-1",
        decision: "allow",
      },
      createContext(runSystem, replies),
    );

    expect(received).toEqual(["permission-1", "allow"]);
    expect(replies).toEqual([]);
  });

  it("reports missing permission requests", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];

    handlePermissionDecision(
      {
        type: "permission_decision",
        runId: "run-1",
        permissionRequestId: "missing",
        decision: "deny",
        requestId: "request-1",
      },
      createContext(runSystem, replies),
    );

    expect(replies[0]).toMatchObject({
      type: "error",
      code: "NO_PENDING_PERMISSION",
      requestId: "request-1",
    });
  });

  it("routes question responses and steering messages", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];
    const received: string[] = [];
    runSystem.actions.register("resolveQuestion", "run-1", (id, response) => {
      received.push(id, response);
      return true;
    });
    runSystem.actions.register("steer", "run-1", (text) => {
      received.push(text);
      return true;
    });

    handleQuestionResponse(
      {
        type: "question_response",
        runId: "run-1",
        questionRequestId: "question-1",
        response: "answer",
      },
      createContext(runSystem, replies),
    );
    handleSteerRun(
      { type: "steer_run", runId: "run-1", text: "redirect" },
      createContext(runSystem, replies),
    );

    expect(received).toEqual(["question-1", "answer", "redirect"]);
    expect(replies).toEqual([]);
  });

  it("reports missing question and steering actions", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];

    handleQuestionResponse(
      {
        type: "question_response",
        runId: "run-1",
        questionRequestId: "missing",
        response: "answer",
      },
      createContext(runSystem, replies),
    );
    handleSteerRun(
      { type: "steer_run", runId: "run-1", text: "redirect" },
      createContext(runSystem, replies),
    );

    expect(
      replies.map((reply) => ("code" in reply ? reply.code : null)),
    ).toEqual(["NO_PENDING_QUESTION", "RUN_NOT_STEERABLE"]);
  });

  it("passes policy patches through without reshaping their contract", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];
    let called = false;
    runSystem.actions.register("updatePolicy", "run-1", (patch, toolName) => {
      called =
        patch.mode === "write" &&
        patch.default === "allow" &&
        toolName === "write_file";
      return true;
    });

    handleUpdatePolicy(
      {
        type: "update_policy",
        runId: "run-1",
        mode: "write",
        default: "allow",
        allow: ["src/**"],
        deny: [],
        tool: "write_file",
      },
      createContext(runSystem, replies),
    );

    expect(called).toBe(true);
    expect(replies).toEqual([]);
  });

  it("reports a missing run for policy updates", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];

    handleUpdatePolicy(
      {
        type: "update_policy",
        runId: "missing",
        mode: "read",
        default: "deny",
      },
      createContext(runSystem, replies),
    );

    expect(replies[0]).toMatchObject({
      type: "error",
      code: "RUN_NOT_FOUND",
    });
  });
});

describe("MCP request handlers", () => {
  it("lists and updates servers using RunSystem contracts", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];
    const assignedAgents = ["assistant"] as const;
    const statuses = [
      {
        id: "filesystem",
        source: "user" as const,
        transport: "stdio" as const,
        enabled: true,
        enabledByDefault: true,
        connected: true,
        toolCount: 3,
        assignedAgents,
      },
    ];
    let updateOptions: Parameters<RunSystem["updateMcpServer"]>[0] | undefined;
    runSystem.listMcpServers = async () => statuses;
    runSystem.updateMcpServer = async (options) => {
      updateOptions = options;
      return statuses;
    };

    await handleListMcpServers(
      {
        type: "list_mcp_servers",
        cwd: "/workspace",
        runId: "run-1",
        strategyPath: "/strategy.json",
        requestId: "list-1",
      },
      createContext(runSystem, replies),
    );
    await handleUpdateMcpServer(
      {
        type: "update_mcp_server",
        serverId: "filesystem",
        enabled: false,
        scope: "run",
        cwd: "/workspace",
        runId: "run-1",
        strategyPath: "/strategy.json",
        requestId: "update-1",
      },
      createContext(runSystem, replies),
    );

    expect(replies).toHaveLength(2);
    expect(replies[0]).toMatchObject({
      type: "mcp_server_list",
      requestId: "list-1",
    });
    expect(
      replies[0]?.type === "mcp_server_list"
        ? replies[0].servers[0]?.assignedAgents
        : undefined,
    ).not.toBe(assignedAgents);
    expect(updateOptions).toEqual({
      serverId: "filesystem",
      enabled: false,
      scope: "run",
      cwd: "/workspace",
      runId: "run-1",
      strategyPath: "/strategy.json",
    });
  });

  it("converts MCP failures into protocol errors", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];
    runSystem.listMcpServers = async () => {
      throw new Error("list failed");
    };
    runSystem.updateMcpServer = async () => {
      throw "update failed";
    };

    await handleListMcpServers(
      { type: "list_mcp_servers" },
      createContext(runSystem, replies),
    );
    await handleUpdateMcpServer(
      {
        type: "update_mcp_server",
        serverId: "filesystem",
        enabled: true,
        scope: "default",
      },
      createContext(runSystem, replies),
    );

    expect(replies).toEqual([
      expect.objectContaining({
        type: "error",
        code: "MCP_LIST_FAILED",
        message: "list failed",
      }),
      expect.objectContaining({
        type: "error",
        code: "MCP_UPDATE_FAILED",
        message: "update failed",
      }),
    ]);
  });
});

describe("provider discovery request handlers", () => {
  it("lists catalog models through the available-model wire contract", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];

    await handleGetAvailableModels(
      {
        type: "get_available_models",
        modelId: "gpt-4o",
        scope: "$global",
        requestId: "models-1",
      },
      createContext(runSystem, replies),
    );

    expect(replies[0]?.type).toBe("available_models");
    if (replies[0]?.type !== "available_models") return;
    expect(replies[0].requestId).toBe("models-1");
    expect(replies[0].models.length).toBeGreaterThan(0);
    expect(
      replies[0].models.every((model) => model.id.includes("gpt-4o")),
    ).toBe(true);
    expect(replies[0].models.map((model) => model.id)).toEqual(
      [...replies[0].models.map((model) => model.id)].sort(),
    );
  });

  it("lists providers using the daemon's canonical model mapper", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];

    await handleListProviders(
      {
        type: "list_providers",
        live: false,
        scope: "$global",
        requestId: "providers-1",
      },
      createContext(runSystem, replies),
    );

    expect(replies[0]?.type).toBe("provider_list");
    if (replies[0]?.type !== "provider_list") return;
    expect(replies[0].requestId).toBe("providers-1");
    expect(replies[0].providers.length).toBeGreaterThan(0);
    expect(
      replies[0].providers.every((provider) =>
        provider.models.every((model) => typeof model.id === "string"),
      ),
    ).toBe(true);
  });
});

describe("Hub request handlers", () => {
  it("handles list, install, update, and remove through HubManager", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];
    const installedPackage: InstalledHubPackage = {
      name: "@comma/test",
      version: "1.0.0",
      commit: "abc123",
      path: "/packages/test",
      executableCodeApproved: true,
    };
    const hubManager = {
      listAvailable: async () => [],
      listInstalled: async () => [installedPackage],
      install: async () => installedPackage,
      update: async () => installedPackage,
      remove: async () => true,
    } as unknown as HubManager;

    await handleHubList(
      { type: "hub_list", requestId: "list-1" },
      createContext(runSystem, replies, hubManager),
    );
    await handleHubInstall(
      {
        type: "hub_install",
        name: installedPackage.name,
        allowCode: true,
      },
      createContext(runSystem, replies, hubManager),
    );
    await handleHubUpdate(
      { type: "hub_update", name: installedPackage.name },
      createContext(runSystem, replies, hubManager),
    );
    await handleHubRemove(
      { type: "hub_remove", name: installedPackage.name },
      createContext(runSystem, replies, hubManager),
    );

    expect(replies.map((reply) => reply.type)).toEqual([
      "hub_packages",
      "hub_packages",
      "hub_packages",
      "hub_packages",
    ]);
  });

  it("reports unavailable and failing Hub managers", async () => {
    const runSystem = await createTestRunSystem();
    const replies: DaemonMessage[] = [];
    const failingManager = {
      install: async () => {
        throw "install failed";
      },
    } as unknown as HubManager;

    await handleHubList(
      { type: "hub_list" },
      createContext(runSystem, replies),
    );
    await handleHubInstall(
      { type: "hub_install", name: "@comma/test" },
      createContext(runSystem, replies, failingManager),
    );

    expect(replies).toEqual([
      expect.objectContaining({
        type: "error",
        code: "HUB_ERROR",
        message: "Hub manager is unavailable",
      }),
      expect.objectContaining({
        type: "error",
        code: "HUB_ERROR",
        message: "install failed",
      }),
    ]);
  });
});

describe("trash request handlers", () => {
  it("lists, restores, and clears workspace trash entries", async () => {
    const runSystem = await createTestRunSystem();
    const workspace = await mkdtemp(join(tmpdir(), "comma-trash-handlers-"));
    tempDirs.push(workspace, trashWorkspaceDir(workspace));
    const replies: DaemonMessage[] = [];
    const originalPath = join(workspace, "note.txt");
    await Bun.write(originalPath, "content");
    const archivePath = await moveToTrash(workspace, originalPath);

    await handleTrashList(
      { type: "trash_list", cwd: workspace, requestId: "list-1" },
      createContext(runSystem, replies),
    );
    await handleTrashRestore(
      {
        type: "trash_restore",
        cwd: workspace,
        trashPath: archivePath,
        targetPath: "restored.txt",
        requestId: "restore-1",
      },
      createContext(runSystem, replies),
    );

    const secondArchive = await moveToTrash(
      workspace,
      join(workspace, "restored.txt"),
    );
    expect(secondArchive).toBeString();

    await handleTrashClear(
      { type: "trash_clear", cwd: workspace, requestId: "clear-1" },
      createContext(runSystem, replies),
    );

    expect(replies[0]).toMatchObject({
      type: "trash_list_result",
      totalEntries: 1,
      requestId: "list-1",
    });
    expect(replies[1]).toMatchObject({
      type: "trash_restore_result",
      restored: join(workspace, "restored.txt"),
      requestId: "restore-1",
    });
    expect(replies[2]).toMatchObject({
      type: "trash_clear_result",
      cleared: 1,
      requestId: "clear-1",
    });
  });

  it("reports restore failures through the protocol error contract", async () => {
    const runSystem = await createTestRunSystem();
    const workspace = await mkdtemp(join(tmpdir(), "comma-trash-handlers-"));
    tempDirs.push(workspace, trashWorkspaceDir(workspace));
    const replies: DaemonMessage[] = [];

    await handleTrashRestore(
      {
        type: "trash_restore",
        cwd: workspace,
        trashPath: join(workspace, "missing.tar.gz"),
      },
      createContext(runSystem, replies),
    );

    expect(replies[0]).toMatchObject({
      type: "error",
      code: "RESTORE_FAILED",
    });
  });
});
