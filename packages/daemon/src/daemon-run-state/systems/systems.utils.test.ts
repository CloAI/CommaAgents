import { describe, expect, test } from "bun:test";
import { createRunActionRegistry } from "./systems.utils";

describe("createRunActionRegistry", () => {
  test("invokes an action with its typed arguments", () => {
    const registry = createRunActionRegistry();
    const received: string[] = [];

    registry.register("resolveInput", "run-1", (agentName, text) => {
      received.push(agentName, text);
      return true;
    });

    expect(registry.invoke("resolveInput", "run-1", "user", "hello")).toBe(
      true,
    );
    expect(received).toEqual(["user", "hello"]);
  });

  test("unregisters every action for a run", () => {
    const registry = createRunActionRegistry();

    registry.register("steer", "run-1", () => true);
    registry.register("resolveQuestion", "run-1", () => true);

    registry.unregisterAll("run-1");

    expect(registry.invoke("steer", "run-1", "redirect")).toBe(false);
    expect(
      registry.invoke("resolveQuestion", "run-1", "question", "answer"),
    ).toBe(false);
  });
});
