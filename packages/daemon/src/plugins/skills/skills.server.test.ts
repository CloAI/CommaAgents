import { afterEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDaemonServer } from "../../daemon-server/daemon-server";
import { connectSocket } from "../../daemon-server/test.utils";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  createRunDirectory,
} from "../runs/test.utils";
import { createSkillsPlugin } from "./skills";

afterEach(cleanupRunFixtures);

describe("skills commands over WebSocket", () => {
  it("should route metadata, content, search, and run snapshot reads with correlated replies", async () => {
    const runs = createMockRunsPlugin({
      runsDir: createRunDirectory(),
      loadStrategy: fakeLoader({ loads: [], restored: [] }),
    });
    const cwd = directories.at(-1)!;
    await mkdir(join(cwd, ".comma", "skills", "project-checks"), {
      recursive: true,
    });
    await writeFile(
      join(cwd, ".comma", "skills", "project-checks", "SKILL.md"),
      "---\nname: project-checks\ndescription: Check the project.\n---\nRead the checks first.",
    );
    const skills = createSkillsPlugin({
      dependencies: { runs },
      discovery: { globalSkillsDir: null },
    });
    const server = createDaemonServer({
      daemon: { plugins: { skills } },
      port: 0,
    });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const invoke = async (
        command: string,
        options: Record<string, string | number>,
      ) => {
        const requestId = crypto.randomUUID();
        client.send({
          type: "command",
          command: `skills.${command}`,
          requestId,
          arguments: options,
        });
        let timeout: ReturnType<typeof setTimeout>;
        const result = await Promise.race([
          client.next(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`No reply for skills.${command}`)),
              3_000,
            );
          }),
        ]).finally(() => clearTimeout(timeout));
        expect(result).toMatchObject({ type: "response", requestId });
        return result;
      };
      const listed = await invoke("list", { cwd });
      expect(listed).toMatchObject({
        ok: true,
        data: {
          skills: [{ name: "project-checks", origin: "project" }],
          warnings: [],
        },
      });
      expect(JSON.stringify(listed)).not.toContain("Read the checks first.");
      expect(
        await invoke("get", { cwd, name: "project-checks" }),
      ).toMatchObject({
        ok: true,
        data: {
          skill: { name: "project-checks", content: "Read the checks first." },
          warnings: [],
        },
      });
      expect(
        await invoke("search", { cwd, query: "project", limit: 1 }),
      ).toMatchObject({
        ok: true,
        data: {
          matches: [{ name: "project-checks", score: expect.any(Number) }],
          totalMatches: 1,
          warnings: [],
        },
      });
      expect(await invoke("listForRun", { runId: "root" })).toMatchObject({
        ok: true,
        data: { available: false, skills: [], warnings: [] },
      });
      await runs.prepareRun({
        runId: "root",
        configuration: { cwd, strategyPath: "example.json" },
      });
      expect(await invoke("listForRun", { runId: "root" })).toMatchObject({
        ok: true,
        data: { available: true, skills: [{ name: "project-checks" }] },
      });
      expect(await invoke("get", { cwd, name: "missing" })).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND" },
      });
      await runs.startRun("root", "complete").completion;
      expect(await invoke("listForRun", { runId: "root" })).toMatchObject({
        ok: true,
        data: { available: false, skills: [], warnings: [] },
      });
      for (const invalid of [
        { cwd, query: " " },
        { cwd, query: "checks", limit: 51 },
      ]) {
        const invalidClient = await connectSocket(server.url);
        invalidClient.send({
          type: "command",
          command: "skills.search",
          requestId: crypto.randomUUID(),
          arguments: invalid,
        });
        expect((await invalidClient.closed).code).toBe(1008);
      }
    } finally {
      client.socket.close();
      await server.stop();
      await runs.dispose();
      await skills.dispose();
    }
  });
});
