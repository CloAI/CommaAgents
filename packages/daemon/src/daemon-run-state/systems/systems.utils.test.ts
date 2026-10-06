import { describe, expect, test } from "bun:test";
import { createRunActionRegistry } from "./systems.utils";

describe("createRunActionRegistry", () => {
  test("invokes an action with its typed arguments", () => {
    const registry = createRunActionRegistry();
    const received: string[] = [];

    registry.register("resolveInput", (agentName, text) => {
      received.push(agentName, text);
      return true;
    });

    expect(registry.invoke("resolveInput", "user", "hello")).toBe(true);
    expect(received).toEqual(["user", "hello"]);
  });

  test("unregisters every action for a run", () => {
    const registry = createRunActionRegistry();

    registry.register("steer", () => true);
    registry.register("resolveQuestion", () => true);

    registry.unregisterAll();

    expect(registry.invoke("steer", "redirect")).toBe(false);
    expect(registry.invoke("resolveQuestion", "question", "answer")).toBe(
      false,
    );
  });
});
