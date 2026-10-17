import { describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemonKernel } from "./daemon-kernel";

describe("daemon kernel", () => {
  test("stops runs before features and cleans every plugin even when one cleanup fails", async () => {
    const runsDir = mkdtempSync(join(tmpdir(), "daemon-kernel-"));
    try {
      const order: string[] = [];
      const kernel = await createDaemonKernel({
        runs: { runsDir },
        initialize(plugins) {
          for (const plugin of Object.values(plugins)) {
            const dispose = plugin.dispose;
            spyOn(plugin, "dispose").mockImplementation(async () => {
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
        "runs",
        "lsp",
        "mcp",
        "skills",
        "questions",
        "sandbox",
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
          runs.registerRunPreparation({ name: "feature", prepare: () => ({}) });
        },
      });
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
    let disposal: ReturnType<typeof spyOn> | undefined;
    let sandboxDisposal: ReturnType<typeof spyOn> | undefined;
    let questionsDisposal: ReturnType<typeof spyOn> | undefined;
    let skillsDisposal: ReturnType<typeof spyOn> | undefined;
    let mcpDisposal: ReturnType<typeof spyOn> | undefined;
    let lspDisposal: ReturnType<typeof spyOn> | undefined;
    try {
      await expect(
        createDaemonKernel({
          runs: { runsDir },
          initialize(plugins) {
            disposal = spyOn(plugins.runs, "dispose");
            sandboxDisposal = spyOn(plugins.sandbox, "dispose");
            questionsDisposal = spyOn(plugins.questions, "dispose");
            skillsDisposal = spyOn(plugins.skills, "dispose");
            mcpDisposal = spyOn(plugins.mcp, "dispose");
            lspDisposal = spyOn(plugins.lsp, "dispose");
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
