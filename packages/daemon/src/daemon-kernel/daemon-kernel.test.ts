import { describe, expect, vi, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemonKernel } from "./daemon-kernel";
import * as runsModule from "../plugins/runs/runs";

describe("daemon kernel", () => {
  test("disposes constructed services if the project catalog cannot initialize", async () => {
    const runsDir = mkdtempSync(join(tmpdir(), "daemon-kernel-invalid-projects-"));
    const createRunsPlugin = runsModule.createRunsPlugin;
    let disposal: ReturnType<typeof vi.spyOn> | undefined;
    const creating = vi.spyOn(runsModule, "createRunsPlugin").mockImplementation((options) => {
      const plugin = createRunsPlugin(options);
      disposal = vi.spyOn(plugin, "dispose");
      return plugin;
    });
    try {
      mkdirSync(join(runsDir, ".projects"));
      writeFileSync(join(runsDir, ".projects", "catalog.json"), JSON.stringify({ projects: [], chats: [], requests: [] }));
      await expect(createDaemonKernel({ runs: { runsDir } })).rejects.toThrow("missing General");
      expect(disposal).toHaveBeenCalledTimes(1);
    } finally {
      creating.mockRestore();
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  test("stops runs before features and cleans every plugin even when one cleanup fails", async () => {
    const runsDir = mkdtempSync(join(tmpdir(), "daemon-kernel-"));
    try {
      const order: string[] = [];
      const kernel = await createDaemonKernel({
        runs: { runsDir },
        initialize(plugins) {
          for (const plugin of Object.values(plugins)) {
            const dispose = plugin.dispose;
            vi.spyOn(plugin, "dispose").mockImplementation(async () => {
              order.push(plugin.name);
              await dispose();
              if (plugin.name === "mcp") {
                throw new Error("MCP cleanup failed");
              }
            });
          }
        },
      });
      await expect(kernel.dispose()).rejects.toThrow("MCP cleanup failed");
      expect(order).toEqual([
        "projects",
        "runs",
        "lsp",
        "mcp",
        "skills",
        "questions",
        "sandbox",
        "core",
        "status",
      ]);
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  test("allows feature registration during setup and afterward", async () => {
    const runsDir = mkdtempSync(join(tmpdir(), "daemon-kernel-"));
    try {
      const kernel = await createDaemonKernel({
        runs: { runsDir },
        initialize({ runs }) {
          runs.registerRunPreparation({
            name: "feature",
            prepare: () => ({ strategyInputs: {} }),
          });
        },
      });
      expect(kernel.plugins.projects.name).toBe("projects");
      expect(kernel.plugins.core.name).toBe("core");
      expect(kernel.plugins.runs.name).toBe("runs");
      expect(kernel.plugins.sandbox.name).toBe("sandbox");
      expect(kernel.plugins.questions.name).toBe("questions");
      expect(kernel.plugins.skills.name).toBe("skills");
      expect(kernel.plugins.mcp.name).toBe("mcp");
      expect(kernel.plugins.lsp.name).toBe("lsp");
      expect(kernel.plugins.runs).not.toHaveProperty("closeRegistration");
      expect(() =>
        kernel.plugins.runs.registerStrategyHooks({
          name: "late",
          attach() {},
        }),
      ).not.toThrow();
      await kernel.dispose();
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  test("disposes runs when feature initialization fails", async () => {
    const runsDir = mkdtempSync(join(tmpdir(), "daemon-kernel-"));
    let disposal: ReturnType<typeof vi.spyOn> | undefined;
    let sandboxDisposal: ReturnType<typeof vi.spyOn> | undefined;
    let questionsDisposal: ReturnType<typeof vi.spyOn> | undefined;
    let skillsDisposal: ReturnType<typeof vi.spyOn> | undefined;
    let mcpDisposal: ReturnType<typeof vi.spyOn> | undefined;
    let lspDisposal: ReturnType<typeof vi.spyOn> | undefined;
    try {
      await expect(
        createDaemonKernel({
          runs: { runsDir },
          initialize(plugins) {
            disposal = vi.spyOn(plugins.runs, "dispose");
            sandboxDisposal = vi.spyOn(plugins.sandbox, "dispose");
            questionsDisposal = vi.spyOn(plugins.questions, "dispose");
            skillsDisposal = vi.spyOn(plugins.skills, "dispose");
            mcpDisposal = vi.spyOn(plugins.mcp, "dispose");
            lspDisposal = vi.spyOn(plugins.lsp, "dispose");
            throw new Error("feature failed");
          },
        }),
      ).rejects.toThrow("feature failed");
      expect(disposal).toHaveBeenCalledTimes(1);
      expect(sandboxDisposal).toHaveBeenCalledTimes(1);
      expect(questionsDisposal).toHaveBeenCalledTimes(1);
      expect(skillsDisposal).toHaveBeenCalledTimes(1);
      expect(mcpDisposal).toHaveBeenCalledTimes(1);
      expect(lspDisposal).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
