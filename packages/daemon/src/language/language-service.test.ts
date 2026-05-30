import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceLanguageService } from "./language-service";

describe("createWorkspaceLanguageService", () => {
  it("returns undefined when no language adapter is detected", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "comma-lsp-empty-"));
    try {
      expect(createWorkspaceLanguageService({ workspaceRoot })).toBeUndefined();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("detects TypeScript workspaces from source files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "comma-lsp-ts-"));
    try {
      await writeFile(join(workspaceRoot, "index.ts"), "export const x = 1;\n");
      const service = createWorkspaceLanguageService({ workspaceRoot });
      expect(service?.languageIds).toContain("typescript");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
