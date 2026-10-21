import { describe, expect, it } from "bun:test";
import { createStatusPlugin } from "./status";

describe("createStatusPlugin", () => {
  it("should expose status while retaining lifecycle changes on the private controller", async () => {
    const { plugin, setPhase } = createStatusPlugin();
    const phases: string[] = [];
    await plugin.notifications.subscribe(
      "status_updated",
      "daemon",
      (message) => {
        phases.push(message.status.phase);
      },
    );
    expect(plugin.getStatus()).toMatchObject({
      phase: "starting",
      version: expect.any(String),
      startedAt: expect.any(String),
    });
    expect(plugin).not.toHaveProperty("setPhase");
    setPhase("running");
    setPhase("stopping");
    setPhase("stopped");
    expect(phases).toEqual(["starting", "running", "stopping", "stopped"]);
    await plugin.dispose();
    await expect(
      plugin.notifications.subscribe("status_updated", "daemon", () => {}),
    ).rejects.toThrow("disposed");
  });

  it("should bind status commands and replay status through the channel", async () => {
    const { plugin, setPhase } = createStatusPlugin();
    setPhase("running");
    const command = plugin.server!.commands![0]!;
    const status = await command.invoke({});
    expect(status).toEqual(plugin.getStatus());
    const messages: unknown[] = [];
    const controller = new AbortController();
    const channel = plugin.server!.channels![0]!;
    const subscription = await channel.open(
      {},
      {
        signal: controller.signal,
        send(message) {
          messages.push(message);
        },
        end() {},
      },
    );
    expect(messages).toEqual([
      { type: "status.updated", data: plugin.getStatus() },
    ]);
    await subscription?.cleanup?.();
    setPhase("stopping");
    expect(messages.length).toBe(1);
    await plugin.dispose();
  });
});
