import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemonKernel } from "../../../../../daemon-kernel/daemon-kernel";
import { createDaemonServer } from "../../../../../daemon-server/daemon-server";
import { connectSocket } from "../../../../../daemon-server/test.utils";

const STRATEGY = {
  name: "list-strategies-test",
  version: "1.0.0",
  description: "A strategy discovered from the working directory.",
  agents: { talker: { type: "user" } },
  flow: { type: "sequential", name: "main", steps: [{ agent: "talker" }] },
};

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "list-strategies-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("core.strategies.list", () => {
  it("should list strategies discovered from the requested cwd and close on unknown arguments", async () => {
    const cwd = join(directory, "project");
    await mkdir(join(cwd, ".comma", "strategies"), { recursive: true });
    await writeFile(
      join(cwd, ".comma", "strategies", "test.json"),
      JSON.stringify(STRATEGY),
    );
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const requestId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId,
        command: "core.strategies.list",
        arguments: { cwd },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        requestId,
        ok: true,
        data: {
          strategies: expect.arrayContaining([
            expect.objectContaining({
              name: "list-strategies-test",
              origin: "cwd",
              path: join(cwd, ".comma", "strategies", "test.json"),
            }),
            expect.objectContaining({ origin: "bundled" }),
          ]),
          warnings: [],
        },
      });

      client.send({
        type: "command",
        requestId: crypto.randomUUID(),
        command: "core.strategies.list",
        arguments: { directory: cwd },
      });
      expect((await client.closed).code).toBe(1008);
    } finally {
      client.socket.close();
      await server.stop();
      await kernel.dispose();
    }
  });
});
