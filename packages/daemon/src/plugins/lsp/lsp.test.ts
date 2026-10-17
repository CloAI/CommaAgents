import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { cleanupRunFixtures } from "../runs/test.utils";
import { createLspFixture } from "./test.utils";
import type { LspPlugin } from "./lsp.types";

const fixtures: ReturnType<typeof createLspFixture>[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.runs.dispose();
    await fixture.lsp.dispose();
  }
  cleanupRunFixtures();
});

function fixture() {
  const created = createLspFixture();
  fixtures.push(created);
  return created;
}

async function waitForProcess(
  lsp: LspPlugin,
  cwd: string,
  phase: "running" | "failed",
  previousPid: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const status = lsp.getStatus(cwd);
    if (
      status.phase === phase &&
      (phase === "failed" || status.pid !== previousPid)
    ) {
      return;
    }
    await Bun.sleep(25);
  }
  throw new Error(`LSP process did not reach ${phase}`);
}

describe("LSP plugin", () => {
  test("should start lazily once for concurrent requests and close after the last run reference", async () => {
    const { runs, lsp, cwd, writeSource, services } = fixture();
    await writeSource("index.ts", "export const value: number = 1;\n");
    await runs.prepareRun({ runId: "one", strategyPath: "example.json", cwd });
    await runs.prepareRun({ runId: "two", strategyPath: "example.json", cwd });
    await runs.prepareRun({
      runId: "unused",
      strategyPath: "example.json",
      cwd,
    });
    expect(lsp.getStatus(cwd)).toMatchObject({ phase: "stopped", runIds: [] });
    await Promise.all([
      services
        .get("one")!
        .request({ method: "textDocument/diagnostic", path: "index.ts" }),
      lsp.request("two", {
        method: "textDocument/hover",
        path: "index.ts",
        position: { line: 1, character: 14 },
      }),
    ]);
    const status = lsp.getStatus(cwd);
    expect(status.phase).toBe("running");
    expect([...status.runIds].sort()).toEqual(["one", "two"]);
    expect(status.pid).toBeDefined();
    await runs.stopRun("one");
    expect(lsp.getStatus(cwd)).toMatchObject({
      phase: "running",
      pid: status.pid,
      runIds: ["two"],
    });
    await runs.stopRun("two");
    expect(lsp.getStatus(cwd)).toMatchObject({ phase: "stopped", runIds: [] });
    expect(() => process.kill(status.pid!, 0)).toThrow();
    await runs.stopRun("unused");
  });

  test("should use distinct processes for different working directories", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    const childCwd = join(cwd, "different");
    await mkdir(childCwd);
    await writeSource("index.ts", "export const value = 1;\n");
    await writeSource(
      "different/index.ts",
      "export const value = 'separate';\n",
    );
    await runs.prepareRun({ runId: "one", strategyPath: "example.json", cwd });
    await runs.prepareRun({
      runId: "two",
      strategyPath: "example.json",
      cwd: childCwd,
    });
    const results = await Promise.all([
      lsp.request("one", {
        method: "textDocument/hover",
        path: "index.ts",
        position: { line: 1, character: 14 },
      }),
      lsp.request("two", {
        method: "textDocument/hover",
        path: "index.ts",
        position: { line: 1, character: 14 },
      }),
    ]);
    expect(results[0]!.hover?.contents).toContain("1");
    expect(results[1]!.hover?.contents).toContain("separate");
    expect(lsp.getStatus(cwd).pid).not.toBe(lsp.getStatus(childCwd).pid);
    await runs.stopRun("one");
    expect(lsp.getStatus(childCwd).phase).toBe("running");
  });

  test("should observe saved edits, new files, renames, deletions, and root config changes", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    const config = {
      compilerOptions: { noImplicitAny: false },
      include: ["src/**/*.ts"],
    };
    await writeSource("tsconfig.json", JSON.stringify(config));
    await writeSource(
      "src/index.ts",
      "export const value: number = 'bad';\nexport function read(input) { return input; }\n",
    );
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    const initial = await lsp.request("root", {
      method: "textDocument/diagnostic",
      path: "src/index.ts",
    });
    expect(
      initial.diagnostics?.some((diagnostic) => diagnostic.code === 2322),
    ).toBe(true);
    await writeSource(
      "src/index.ts",
      "export const value: number = 1;\nexport function read(input) { return input; }\n",
    );
    expect(
      (
        await lsp.request("root", {
          method: "textDocument/diagnostic",
          path: "src/index.ts",
        })
      ).diagnostics?.some((diagnostic) => diagnostic.code === 2322),
    ).toBe(false);
    await writeSource("src/added.ts", "export const AddedSymbol = 1;\n");
    expect(
      (
        await lsp.request("root", {
          method: "workspace/symbol",
          query: "AddedSymbol",
        })
      ).symbols?.some((symbol) => symbol.path === "src/added.ts"),
    ).toBe(true);
    await rename(join(cwd, "src/added.ts"), join(cwd, "src/renamed.ts"));
    expect(
      (
        await lsp.request("root", {
          method: "workspace/symbol",
          query: "AddedSymbol",
        })
      ).symbols?.map((symbol) => symbol.path),
    ).toEqual(["src/renamed.ts"]);
    await unlink(join(cwd, "src/renamed.ts"));
    expect(
      (
        await lsp.request("root", {
          method: "workspace/symbol",
          query: "AddedSymbol",
        })
      ).symbols,
    ).toEqual([]);
    await writeSource(
      "tsconfig.json",
      JSON.stringify({ ...config, compilerOptions: { noImplicitAny: true } }),
    );
    expect(
      (
        await lsp.request("root", {
          method: "textDocument/diagnostic",
          path: "src/index.ts",
        })
      ).diagnostics?.some((diagnostic) => diagnostic.code === 7006),
    ).toBe(true);
  });

  test("should honor root jsconfig and support files created after preparation", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    expect(lsp.getStatus(cwd).phase).toBe("stopped");
    await writeSource(
      "jsconfig.json",
      JSON.stringify({
        compilerOptions: { checkJs: true },
        include: ["src/**/*.js"],
      }),
    );
    await writeSource("src/index.js", "export const value = missingName;\n");
    const result = await lsp.request("root", {
      method: "textDocument/diagnostic",
      languageId: "javascript",
      path: "src/index.js",
    });
    expect(
      result.diagnostics?.some((diagnostic) => diagnostic.code === 2304),
    ).toBe(true);
  });

  test("should translate navigation queries and keep nested config discovery deferred", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await writeSource(
      "tsconfig.json",
      JSON.stringify({
        include: ["src/**/*.ts"],
        compilerOptions: { strict: false },
      }),
    );
    await writeSource(
      "src/tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true } }),
    );
    const source =
      "export interface Shape { size: number }\nexport class Box implements Shape { size = 1 }\nexport const box: Shape = new Box();\nexport const value = box.size;\nexport function read(input) { return input; }\n";
    await writeSource("src/index.ts", source);
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    const atBox = {
      path: "src/index.ts",
      position: { line: 4, character: 22 },
    };
    expect(
      (
        await lsp.request("root", {
          ...atBox,
          method: "textDocument/definition",
        })
      ).locations?.[0]?.path,
    ).toBe("src/index.ts");
    expect(
      (
        await lsp.request("root", {
          ...atBox,
          method: "textDocument/typeDefinition",
        })
      ).locations?.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await lsp.request("root", {
          ...atBox,
          method: "textDocument/references",
        })
      ).locations?.length,
    ).toBeGreaterThan(1);
    expect(
      (
        await lsp.request("root", {
          method: "textDocument/implementation",
          path: "src/index.ts",
          position: { line: 1, character: 18 },
        })
      ).locations?.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await lsp.request("root", {
          method: "textDocument/documentSymbol",
          path: "src/index.ts",
        })
      ).symbols?.some((symbol) => symbol.name === "Box"),
    ).toBe(true);
    expect(
      (
        await lsp.request("root", {
          method: "textDocument/diagnostic",
          path: "src/index.ts",
        })
      ).diagnostics?.some((diagnostic) => diagnostic.code === 7006),
    ).toBe(false);
  });

  test("should isolate cancellation and retain the process for another run", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await writeSource("index.ts", "export const value = 1;\n");
    await runs.prepareRun({ runId: "one", strategyPath: "example.json", cwd });
    await runs.prepareRun({ runId: "two", strategyPath: "example.json", cwd });
    const cancelled = lsp.request("one", {
      method: "textDocument/diagnostic",
      path: "index.ts",
    });
    const surviving = lsp.request("two", {
      method: "textDocument/diagnostic",
      path: "index.ts",
    });
    const rejection = cancelled.then(
      () => undefined,
      (error: unknown) => error,
    );
    await runs.stopRun("one");
    expect(await rejection).toBeInstanceOf(DOMException);
    expect((await surviving).diagnostics).toEqual([]);
    expect(lsp.getStatus(cwd)).toMatchObject({
      phase: "running",
      runIds: ["two"],
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      lsp.request("two", { method: "workspace/symbol" }, controller.signal),
    ).rejects.toThrow("aborted");
    expect(lsp.getStatus(cwd).phase).toBe("running");
  });

  test("should automatically replace a crashed process without ending its run", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await writeSource("index.ts", "export const value = 1;\n");
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    await lsp.request("root", { method: "workspace/symbol", query: "value" });
    const pid = lsp.getStatus(cwd).pid!;
    process.kill(pid, "SIGKILL");
    await waitForProcess(lsp, cwd, "running", pid);
    expect((await runs.getRun("root"))?.phase).toBe("prepared");
    expect(lsp.getStatus(cwd).runIds).toEqual(["root"]);
    expect(
      (
        await lsp.request("root", {
          method: "textDocument/diagnostic",
          path: "index.ts",
        })
      ).diagnostics,
    ).toEqual([]);
  });

  test("should release last references, reject stale facades, and rediscover on continuation", async () => {
    const { runs, lsp, cwd, writeSource, services } = fixture();
    await writeSource("index.ts", "export const value = 1;\n");
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    const previous = services.get("root")!;
    await previous.request({
      method: "textDocument/diagnostic",
      path: "index.ts",
    });
    const pid = lsp.getStatus(cwd).pid;
    await runs.startRun("root", "done").completion;
    expect(lsp.getStatus(cwd).phase).toBe("stopped");
    await runs.prepareRun({ runId: "root" });
    await expect(
      previous.request({ method: "workspace/symbol" }),
    ).rejects.toThrow("unavailable");
    await lsp.request("root", { method: "workspace/symbol", query: "value" });
    expect(lsp.getStatus(cwd).pid).not.toBe(pid);
    const disposal = lsp.dispose();
    expect(lsp.dispose()).toBe(disposal);
    await disposal;
    expect(lsp.getStatus(cwd).phase).toBe("stopped");
    await expect(
      lsp.request("root", { method: "workspace/symbol" }),
    ).rejects.toThrow("unavailable");
  });

  test("should share its subprocess with a child run and release both references on completion", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await writeSource("index.ts", "export const value = 1;\n");
    let childPid: number | undefined;
    let childRunId = "";
    runs.registerStrategyHooks({
      name: "child-lsp-query",
      async attach(strategyContext) {
        if (!strategyContext.parentRunId) {
          return;
        }
        childRunId = strategyContext.runId;
        await lsp.request(childRunId, {
          method: "textDocument/diagnostic",
          path: "index.ts",
        });
        childPid = lsp.getStatus(cwd).pid;
        expect(lsp.getStatus(cwd).runIds).toContain("root");
        expect(lsp.getStatus(cwd).runIds).toContain(childRunId);
      },
    });
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    await lsp.request("root", {
      method: "textDocument/diagnostic",
      path: "index.ts",
    });
    const parentPid = lsp.getStatus(cwd).pid;
    expect((await runs.startRun("root", "child").completion).status).toBe(
      "completed",
    );
    expect(childPid).toBe(parentPid);
    expect(childRunId).not.toBe("");
    expect(lsp.getStatus(cwd).phase).toBe("stopped");
  });

  test("should release acquired resources when a later strategy hook fails", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await writeSource("index.ts", "export const value = 1;\n");
    let pid: number | undefined;
    runs.registerStrategyHooks({
      name: "failure-after-lsp",
      async attach(strategyContext) {
        await lsp.request(strategyContext.runId, {
          method: "workspace/symbol",
          query: "value",
        });
        pid = lsp.getStatus(cwd).pid;
        throw new Error("strategy hook failed");
      },
    });
    await expect(
      runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd }),
    ).rejects.toThrow("strategy hook failed");
    expect(lsp.getStatus(cwd).phase).toBe("stopped");
    expect(() => process.kill(pid!, 0)).toThrow();
  });

  test("should treat invalid project configuration as a request error without restarting", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await writeSource("index.ts", "export const value = 1;\n");
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    await lsp.request("root", { method: "workspace/symbol", query: "value" });
    const pid = lsp.getStatus(cwd).pid;
    await writeSource("tsconfig.json", "{ invalid json");
    await expect(
      lsp.request("root", { method: "workspace/symbol" }),
    ).rejects.toThrow();
    expect(lsp.getStatus(cwd)).toMatchObject({ phase: "running", pid });
    await writeSource(
      "tsconfig.json",
      JSON.stringify({ include: ["index.ts"] }),
    );
    expect(
      (
        await lsp.request("root", {
          method: "textDocument/diagnostic",
          path: "index.ts",
        })
      ).diagnostics,
    ).toEqual([]);
  });

  test("should report repeated replacement crashes as failed without an endless restart loop", async () => {
    const { runs, lsp, cwd, writeSource } = fixture();
    await writeSource("index.ts", "export const value = 1;\n");
    await runs.prepareRun({ runId: "root", strategyPath: "example.json", cwd });
    await lsp.request("root", { method: "workspace/symbol", query: "value" });
    const firstPid = lsp.getStatus(cwd).pid!;
    process.kill(firstPid, "SIGKILL");
    await waitForProcess(lsp, cwd, "running", firstPid);
    const replacementPid = lsp.getStatus(cwd).pid!;
    process.kill(replacementPid, "SIGKILL");
    await waitForProcess(lsp, cwd, "failed", replacementPid);
    await expect(
      lsp.request("root", { method: "workspace/symbol" }),
    ).rejects.toThrow("exited");
    expect((await runs.getRun("root"))?.phase).toBe("prepared");
  });
});
